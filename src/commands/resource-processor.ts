import * as jsoncParser from 'jsonc-parser'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Worker } from '../resources'
import type { Config, DefineFn, Resource } from '../types'
import type { DurableObjectMigration } from '../utils/migrations'
import { deleteDurableObjectClasses, getBoundDurableObjectClasses, getRemovedDurableObjects, validateDurableObjects } from './durable-objects'
import { tryReadFile } from './utils/fs'

export const DEFAULT_CONFIG_FILE_NAME = 'wrangler.jsonc'

/**
 * Returns an error message when `name` cannot be used as the generated config's file name.
 * It is joined onto each worker's `dir`, so it must be a bare file name, and the generator
 * always writes JSONC, so it must end in `.json` or `.jsonc`.
 */
export const validateConfigFileName = (name: string): string | undefined => {
	if (!name || path.basename(name) !== name || name === '.' || name === '..') {
		return `Config file name must be a bare file name without a directory, got '${name}'`
	}
	if (!/\.jsonc?$/.test(name)) {
		return `Config file name must end with .json or .jsonc, got '${name}'`
	}
	return undefined
}

export class ResourceProcessor {
	private workers: Worker[] = []

	constructor(
		private readonly resourceHandler: ResourceApplier,
		private readonly configWriter: ConfigWriter = defaultConfigWriter,
		private readonly configFileName: string = DEFAULT_CONFIG_FILE_NAME,
	) {
		// Fail before any resource is applied, not when the config is written.
		const error = validateConfigFileName(configFileName)
		if (error) {
			throw new Error(error)
		}
	}

	public async run({ main, env }: {
		main: string
		env: string
	}): Promise<GeneratedConfig[]> {
		const defineFn = (await import(path.resolve(main))).default as DefineFn
		const definition = defineFn({ env })
		return this.process({ definition, env })
	}

	public async process({ definition, env }: {
		definition: Worker | undefined
		env: string
	}): Promise<GeneratedConfig[]> {
		const generated: GeneratedConfig[] = []

		if (definition) {
			await this.validate(definition)
			this.workers.push(definition)
		}

		while (this.workers.length) {
			const result = await this.processWorker(env)
			if (result) {
				generated.push(result)
			}
		}

		return generated
	}

	/** Checks every worker in the tree before any resource is applied or any config is written. */
	private async validate(root: Worker): Promise<void> {
		const queue = [root]
		while (queue.length) {
			const worker = queue.shift()!
			validateDurableObjects(worker, await this.readExistingConfig(worker))
			for (const binding of Object.values(worker.options.bindings ?? {})) {
				if (binding instanceof Worker) {
					queue.push(binding)
				}
			}
		}
	}

	private async readExistingConfig(worker: Worker): Promise<Config> {
		const configPath = path.join(worker.options.dir, this.configFileName)
		return jsoncParser.parse((await tryReadFile(configPath)) || '{}') as Config
	}

	private async processWorker(env: string): Promise<GeneratedConfig | undefined> {
		const worker = this.workers.shift()
		if (!worker) {
			return undefined
		}
		const configPath = path.join(worker.options.dir, this.configFileName)
		const existingConfig = await this.readExistingConfig(worker)
		const { bindings, dir, deleteDurableObjectsOnRemoval, deletedDurableObjects, ...workerConfig } = worker.options

		let config: Config = {
			...workerConfig,
			migrations: existingConfig.migrations,
		}

		const selfState = await this.resourceHandler.applyResource(worker)
		config = worker.configureSelf({ config, state: selfState })

		for (const [bindingName, binding] of Object.entries(bindings ?? {})) {
			if (!binding) {
				continue
			}
			if (binding instanceof Worker) {
				this.workers.push(binding)
			}
			const state = 'apply' in binding ? await this.resourceHandler.applyResource(binding) : undefined
			config = binding.configureBinding({ config, binding: bindingName, state, env })
		}

		const removedDurableObjects = getRemovedDurableObjects({
			workerName: worker.options.name,
			migrations: config.migrations as DurableObjectMigration[] | undefined,
			previouslyBound: getBoundDurableObjectClasses(existingConfig),
			bound: getBoundDurableObjectClasses(config),
			deletedDurableObjects: deletedDurableObjects ?? [],
			deleteDurableObjectsOnRemoval,
		})
		config = deleteDurableObjectClasses(config, removedDurableObjects)

		const content = `/**\n * File is auto generated DO NOT EDIT\n */\n${JSON.stringify(config, null, '\t')}\n`
		await this.configWriter(configPath, content)

		return { path: configPath, config, content }
	}
}

export interface GeneratedConfig {
	path: string
	config: Config
	content: string
}

export type ConfigWriter = (path: string, content: string) => Promise<void>

const defaultConfigWriter: ConfigWriter = (path, content) => fs.writeFile(path, content)

export interface ResourceApplier {
	applyResource<T>(resource: Resource<T>): Promise<T | undefined>
}
