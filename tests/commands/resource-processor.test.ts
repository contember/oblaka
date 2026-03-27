import { describe, expect, test } from 'bun:test'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import { ResourceProcessor, type ConfigWriter, type ResourceApplier } from '../../src/commands/resource-processor'

const noopApplier: ResourceApplier = {
	async applyResource() {
		return undefined
	},
}

const captureWriter = () => {
	const written: { path: string; content: string }[] = []
	const writer: ConfigWriter = async (p, content) => {
		written.push({ path: p, content })
	}
	return { written, writer }
}

const createFixtureDir = async (files: Record<string, string>) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oblaka-test-'))
	for (const [name, content] of Object.entries(files)) {
		const filePath = path.join(dir, name)
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, content)
	}
	return dir
}

describe('ResourceProcessor', () => {
	test('generates config for a simple worker', async () => {
		const dir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				export default ({ env }) => new Worker({
					dir: '${path.resolve('.')}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {},
					main: './src/index.ts',
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(dir, 'oblaka.ts'), env: 'local' })

		expect(written).toHaveLength(1)
		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(config.name).toBe('test-worker')
		expect(config.main).toBe('./src/index.ts')
		expect(config.compatibility_flags).toEqual(['nodejs_compat'])

		await fs.rm(dir, { recursive: true })
	})

	test('processes bindings and generates config', async () => {
		const dir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				import { KVNamespace } from '${path.resolve('src/resources/kv')}'
				import { D1Database } from '${path.resolve('src/resources/d1')}'
				export default ({ env }) => new Worker({
					dir: '${path.resolve('.')}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {
						KV: new KVNamespace({ name: 'my-kv' }),
						DB: new D1Database({ name: 'my-db', migrationsDir: './migrations' }),
					},
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(dir, 'oblaka.ts'), env: 'local' })

		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(config.kv_namespaces).toEqual([{ binding: 'KV', id: 'my-kv' }])
		expect(config.d1_databases).toEqual([{
			binding: 'DB',
			database_name: 'my-db',
			database_id: 'my-db',
			migrations_dir: './migrations',
		}])

		await fs.rm(dir, { recursive: true })
	})

	test('generates durable object migrations', async () => {
		const dir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				import { DurableObject } from '${path.resolve('src/resources/do')}'
				export default ({ env }) => new Worker({
					dir: '${path.resolve('.')}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {
						DO: new DurableObject({ name: 'my-do', className: 'MyDO' }),
					},
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(dir, 'oblaka.ts'), env: 'local' })

		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(config.durable_objects.bindings).toEqual([{ name: 'DO', class_name: 'MyDO' }])
		expect(config.migrations).toEqual([{ tag: 'v0001', new_sqlite_classes: ['MyDO'] }])

		await fs.rm(dir, { recursive: true })
	})

	test('detects deleted durable objects and adds deletion migration', async () => {
		const workerDir = await createFixtureDir({
			'wrangler.jsonc': JSON.stringify({
				name: 'test-worker',
				durable_objects: {
					bindings: [
						{ name: 'DO', class_name: 'MyDO' },
						{ name: 'OLD_DO', class_name: 'OldDO' },
					],
				},
				migrations: [
					{ tag: 'v0001', new_sqlite_classes: ['MyDO'] },
					{ tag: 'v0002', new_sqlite_classes: ['OldDO'] },
				],
			}),
		})

		const entryDir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				import { DurableObject } from '${path.resolve('src/resources/do')}'
				export default ({ env }) => new Worker({
					dir: '${workerDir}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {
						DO: new DurableObject({ name: 'my-do', className: 'MyDO' }),
					},
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(entryDir, 'oblaka.ts'), env: 'local' })

		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))

		// OldDO's new_sqlite_classes migration should be removed
		const oldMigration = config.migrations.find((m: any) => m.new_sqlite_classes?.includes('OldDO'))
		expect(oldMigration).toBeUndefined()

		// Deletion migration should be added
		const deletionMigration = config.migrations.find((m: any) => m.deleted_classes)
		expect(deletionMigration).toBeDefined()
		expect(deletionMigration.deleted_classes).toEqual(['OldDO'])

		// MyDO migration should still exist
		const myDoMigration = config.migrations.find((m: any) => m.new_sqlite_classes?.includes('MyDO'))
		expect(myDoMigration).toBeDefined()

		await fs.rm(workerDir, { recursive: true })
		await fs.rm(entryDir, { recursive: true })
	})

	test('skips DO deletion when deleteDurableObjectsOnRemoval is false', async () => {
		const workerDir = await createFixtureDir({
			'wrangler.jsonc': JSON.stringify({
				name: 'test-worker',
				durable_objects: {
					bindings: [
						{ name: 'DO', class_name: 'MyDO' },
						{ name: 'OLD_DO', class_name: 'OldDO' },
					],
				},
				migrations: [
					{ tag: 'v0001', new_sqlite_classes: ['MyDO'] },
					{ tag: 'v0002', new_sqlite_classes: ['OldDO'] },
				],
			}),
		})

		const entryDir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				import { DurableObject } from '${path.resolve('src/resources/do')}'
				export default ({ env }) => new Worker({
					dir: '${workerDir}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					deleteDurableObjectsOnRemoval: false,
					bindings: {
						DO: new DurableObject({ name: 'my-do', className: 'MyDO' }),
					},
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(entryDir, 'oblaka.ts'), env: 'local' })

		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))

		// No deletion migration should be added
		const deletionMigration = config.migrations.find((m: any) => m.deleted_classes)
		expect(deletionMigration).toBeUndefined()

		await fs.rm(workerDir, { recursive: true })
		await fs.rm(entryDir, { recursive: true })
	})

	test('does not leak oblaka-specific options into generated config', async () => {
		const dir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				export default ({ env }) => new Worker({
					dir: '${path.resolve('.')}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {},
					deleteDurableObjectsOnRemoval: false,
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(dir, 'oblaka.ts'), env: 'local' })

		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(config.deleteDurableObjectsOnRemoval).toBeUndefined()

		await fs.rm(dir, { recursive: true })
	})

	test('handles undefined definition (returns nothing)', async () => {
		const dir = await createFixtureDir({
			'oblaka.ts': `export default ({ env }) => undefined`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(dir, 'oblaka.ts'), env: 'local' })

		expect(written).toHaveLength(0)

		await fs.rm(dir, { recursive: true })
	})

	test('processes nested workers (child workers as bindings)', async () => {
		const parentDir = await createFixtureDir({})
		const childDir = await createFixtureDir({})

		const entryDir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				export default ({ env }) => new Worker({
					dir: '${parentDir}'.replace(/\\\\/g, '/'),
					name: 'parent-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {
						CHILD: new Worker({
							dir: '${childDir}'.replace(/\\\\/g, '/'),
							name: 'child-worker',
							compatibility_flags: ['nodejs_compat'],
							bindings: {},
						}),
					},
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer)
		await processor.run({ main: path.join(entryDir, 'oblaka.ts'), env: 'local' })

		expect(written).toHaveLength(2)

		const parentConfig = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(parentConfig.name).toBe('parent-worker')
		expect(parentConfig.services).toEqual([{ binding: 'CHILD', service: 'child-worker' }])

		const childConfig = JSON.parse(written[1].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(childConfig.name).toBe('child-worker')

		await fs.rm(parentDir, { recursive: true })
		await fs.rm(childDir, { recursive: true })
		await fs.rm(entryDir, { recursive: true })
	})

	test('applies resource state via resource handler', async () => {
		const states = new Map<string, any>()
		const applier: ResourceApplier = {
			async applyResource(resource: any) {
				const id = resource.getId()
				if (id.resource === 'kv_namespace') {
					const state = { id: 'kv-uuid-123', name: 'prod-my-kv' }
					states.set(`${id.resource}:${id.id}`, state)
					return state
				}
				return undefined
			},
		}

		const dir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				import { KVNamespace } from '${path.resolve('src/resources/kv')}'
				export default ({ env }) => new Worker({
					dir: '${path.resolve('.')}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {
						KV: new KVNamespace({ name: 'my-kv' }),
					},
				})
			`,
		})

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(applier, writer)
		await processor.run({ main: path.join(dir, 'oblaka.ts'), env: 'production' })

		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(config.kv_namespaces).toEqual([{ binding: 'KV', id: 'kv-uuid-123' }])

		await fs.rm(dir, { recursive: true })
	})
})
