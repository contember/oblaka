import * as fs from 'node:fs/promises'
import { CloudflareClient } from '../client'
import { destroyers } from '../resources'
import { KVStateStorage, type State } from '../state'
import type { Resource } from '../types'
import type { Input } from './input'
import type { ResourceApplier } from './resource-processor'
import { ResourceProcessor } from './resource-processor'
import { atomic, registerShutdownHandler } from './utils/pm'

export class CloudflareDeployExecutor implements ResourceApplier {
	private remaining: Set<string>
	private totalChanged = 0

	public static async execute({ input }: {
		input: Input
	}) {
		const cfClient = new CloudflareClient({
			accountId: input.accountId,
			apiToken: input.apiToken,
		})

		const stateStore = new KVStateStorage(cfClient, input.stateNamespace)
		const stateKey = { env: input.env }
		const state = await stateStore.get(stateKey)

		const executor = new CloudflareDeployExecutor(input, state, cfClient)

		const unregisterShutdown = registerShutdownHandler(async () => {
			if (input.dryRun) {
				return
			}
			await stateStore.set(stateKey, state)
		})

		try {
			await executor.run()
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
	}

	private constructor(
		private readonly input: Input,
		private readonly state: State,
		private readonly client: CloudflareClient,
	) {
		this.remaining = new Set(Object.keys(state.resources || {}))
	}

	private async run() {
		const resourceProcessor = new ResourceProcessor(this)
		await resourceProcessor.run({ main: this.input.main, env: this.input.env })

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
