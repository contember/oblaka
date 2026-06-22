import * as fs from 'node:fs/promises'
import { createWranglerTokenProvider } from '../auth'
import { CloudflareClient } from '../client'
import { destroyers, type Worker } from '../resources'
import { KVStateStorage, type State } from '../state'
import type { Resource } from '../types'
import type { Input } from './input'
import type { ConfigWriter, GeneratedConfig, ResourceApplier } from './resource-processor'
import { ResourceProcessor } from './resource-processor'
import { atomic, registerShutdownHandler } from './utils/pm'

export class CloudflareDeployExecutor implements ResourceApplier {
	private remaining: Set<string>
	private totalChanged = 0

	public static async execute({ input, definition, configWriter }: {
		input: Input
		definition: Worker | undefined
		configWriter?: ConfigWriter
	}): Promise<GeneratedConfig[]> {
		// An explicit API token wins; otherwise fall back to wrangler's stored
		// OAuth credentials (`wrangler login`).
		const getToken = input.apiToken
			? async () => input.apiToken
			: createWranglerTokenProvider({ persist: input.persistToken })
		const cfClient = new CloudflareClient({
			accountId: input.accountId,
			getToken,
		})

		const stateStore = new KVStateStorage(cfClient, input.stateNamespace, input.stateNamespaceId)
		const stateKey = { env: input.env }
		const state = await stateStore.get(stateKey)

		const executor = new CloudflareDeployExecutor(input, state, cfClient, configWriter)

		const unregisterShutdown = registerShutdownHandler(async () => {
			if (input.dryRun) {
				return
			}
			await stateStore.set(stateKey, state)
		})

		let generated: GeneratedConfig[]
		try {
			generated = await executor.run(definition)
		} finally {
			unregisterShutdown()
			await atomic(async () => {
				if (input.dryRun) {
					return
				}
				await stateStore.set(stateKey, state)
			})
		}

		if (input.outStatePath) {
			await fs.writeFile(input.outStatePath, JSON.stringify(state, null, '\t'))
		}

		return generated
	}

	private constructor(
		private readonly input: Input,
		private readonly state: State,
		private readonly client: CloudflareClient,
		private readonly configWriter?: ConfigWriter,
	) {
		this.remaining = new Set(Object.keys(state.resources || {}))
	}

	private async run(definition: Worker | undefined): Promise<GeneratedConfig[]> {
		const resourceProcessor = new ResourceProcessor(this, this.configWriter)
		const generated = await resourceProcessor.process({ definition, env: this.input.env })

		this.log(`Changed ${this.totalChanged} resources`)

		if (!this.input.destroy && this.remaining.size > 0) {
			this.log('Dangling resources (pass --destroy to delete):')
			for (const idString of this.remaining) {
				this.log(` - ${idString}`)
			}
		} else {
			for (const idString of this.remaining) {
				const [resource, id] = idString.split(':', 2)
				if (!this.input.dryRun) {
					await atomic(async () => {
						await destroyers[resource]?.({
							state: this.state.resources[idString],
							context: {
								env: this.input.env,
								client: this.client,
							},
						})
						delete this.state.resources[idString]
					})
				} else {
					delete this.state.resources[idString]
				}
				this.log(`Destroyed ${resource}:${id}`)
			}
		}

		return generated
	}

	private log(message: string) {
		if (this.input.dryRun) {
			console.log(`[DRY RUN] ${message}`)
		} else {
			console.log(message)
		}
	}

	async applyResource<T>(resource: Resource<T>): Promise<T> {
		return atomic(async () => {
			const id = resource.getId()
			const idString = `${id.resource}:${id.id}`
			const applied = await resource.apply({
				state: this.state?.resources?.[idString],
				dryRun: this.input.dryRun,
				context: {
					env: this.input.env,
					client: this.client,
				},
			})
			const changed = applied !== this.state?.resources?.[idString]
			if (changed) {
				this.log(`Updated ${idString}`)
				this.totalChanged++
			}
			this.state.resources[idString] = applied
			this.remaining.delete(idString)
			return applied
		})
	}
}
