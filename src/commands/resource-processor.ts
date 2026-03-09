import * as jsoncParser from 'jsonc-parser'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Worker } from '../resources'
import type { Config, DefineFn, Resource } from '../types'
import { tryReadFile } from './utils/fs'

export class ResourceProcessor {
	private workers: Worker[] = []

	constructor(
		private readonly resourceHandler: ResourceApplier,
	) {
	}

	public async run({ main, env }: {
		main: string
		env: string
	}) {
		const defineFn = (await import(path.resolve(main))).default as DefineFn
		const definition = defineFn({ env })

		if (definition) {
			this.workers.push(definition)
		}

		while (this.workers.length) {
			await this.processWorker(env)
		}
	}

	private async processWorker(env: string): Promise<void> {
		const worker = this.workers.shift()
		if (!worker) {
			return
		}
		const configPath = path.join(worker.options.dir, 'wrangler.jsonc')
		const existingConfig = jsoncParser.parse((await tryReadFile(configPath)) || '{}') as Config
		const { bindings, dir, ...workerConfig } = worker?.options ?? {}

		let config: Config = {
			...workerConfig,
			migrations: existingConfig.migrations,
		}

		const selfState = await this.resourceHandler.applyResource(worker)
		config = worker.configureSelf({ config, state: selfState })

		for (const [bindingName, binding] of Object.entries(worker.options.bindings ?? {})) {
			if (binding instanceof Worker) {
				this.workers.push(binding)
			}
			const state = 'apply' in binding ? await this.resourceHandler.applyResource(binding) : undefined
			config = binding.configureBinding({ config, binding: bindingName, state, env })
		}

		await fs.writeFile(configPath, `/**\n * File is auto generated DO NOT EDIT\n */\n${JSON.stringify(config, null, '\t')}\n`)
	}
}

export interface ResourceApplier {
	applyResource<T>(resource: Resource<T>): Promise<T | undefined>
}
