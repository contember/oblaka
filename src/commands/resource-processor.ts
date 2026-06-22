import * as jsoncParser from 'jsonc-parser'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Worker } from '../resources'
import type { Config, DefineFn, Resource } from '../types'
import { getNextMigrationTag } from '../utils/migrations'
import { tryReadFile } from './utils/fs'

export class ResourceProcessor {
	private workers: Worker[] = []

	constructor(
		private readonly resourceHandler: ResourceApplier,
		private readonly configWriter: ConfigWriter = defaultConfigWriter,
	) {
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

	private async processWorker(env: string): Promise<GeneratedConfig | undefined> {
		const worker = this.workers.shift()
		if (!worker) {
			return undefined
		}
		const configPath = path.join(worker.options.dir, 'wrangler.jsonc')
		const existingConfig = jsoncParser.parse((await tryReadFile(configPath)) || '{}') as Config
		const { bindings, dir, deleteDurableObjectsOnRemoval, ...workerConfig } = worker.options

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

		if (deleteDurableObjectsOnRemoval !== false) {
			const oldClasses = new Set((existingConfig.durable_objects?.bindings ?? []).map((b: { class_name: string }) => b.class_name))
			const newClasses = new Set((config.durable_objects?.bindings ?? []).map((b: { class_name: string }) => b.class_name))
			const deletedClasses = [...oldClasses].filter(c => !newClasses.has(c))

			if (deletedClasses.length > 0) {
				const deletedClassesSet = new Set(deletedClasses)
				config = {
					...config,
					migrations: [
						...(config.migrations ?? [])
							.flatMap(m => {
								if (!m.new_sqlite_classes) return [m]
								const filtered = m.new_sqlite_classes.filter((c: string) => !deletedClassesSet.has(c))
								if (filtered.length === 0) {
									const { new_sqlite_classes: _, ...rest } = m
									return Object.keys(rest).length > 1 ? [rest as typeof m] : []
								}
								return [{ ...m, new_sqlite_classes: filtered }]
							}),
						{
							tag: getNextMigrationTag(config),
							deleted_classes: deletedClasses,
						},
					],
				}
			}
		}

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
