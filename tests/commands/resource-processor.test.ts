import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { type ConfigWriter, type ResourceApplier, ResourceProcessor, validateConfigFileName } from '../../src/commands/resource-processor'

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

	test('writes config under a custom file name', async () => {
		const dir = await createFixtureDir({
			'wrangler.test.jsonc': JSON.stringify({
				migrations: [{ tag: 'v0001', new_sqlite_classes: ['OtherDO'] }],
			}),
		})
		await fs.writeFile(
			path.join(dir, 'oblaka.ts'),
			`
				import { Worker } from '${path.resolve('src/resources/worker')}'
				export default ({ env }) => new Worker({
					dir: '${dir}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					bindings: {},
					deleteDurableObjectsOnRemoval: false,
				})
			`,
		)

		const { written, writer } = captureWriter()
		const processor = new ResourceProcessor(noopApplier, writer, 'wrangler.test.jsonc')
		await processor.run({ main: path.join(dir, 'oblaka.ts'), env: 'test' })

		expect(written).toHaveLength(1)
		expect(written[0].path).toBe(path.join(dir, 'wrangler.test.jsonc'))
		// existing migrations are read from the custom file, not from wrangler.jsonc
		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(config.migrations).toEqual([{ tag: 'v0001', new_sqlite_classes: ['OtherDO'] }])

		await fs.rm(dir, { recursive: true })
	})

	test('rejects a config file name that is a path or not JSON', () => {
		for (const name of ['apps/api/wrangler.jsonc', '/abs/wrangler.jsonc', '../shared.jsonc', 'wrangler.toml', 'wrangler', '']) {
			expect(validateConfigFileName(name)).toBeDefined()
			expect(() => new ResourceProcessor(noopApplier, undefined, name)).toThrow()
		}
		for (const name of ['wrangler.jsonc', 'wrangler.test.jsonc', 'wrangler.json']) {
			expect(validateConfigFileName(name)).toBeUndefined()
		}
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

	const defaultExistingDoConfig = {
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
	}

	const doFixture = async (workerOptions: string, existingConfig: object = defaultExistingDoConfig) => {
		const workerDir = await createFixtureDir({ 'wrangler.jsonc': JSON.stringify(existingConfig) })
		const entryDir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				import { DurableObject } from '${path.resolve('src/resources/do')}'
				import { KVNamespace } from '${path.resolve('src/resources/kv')}'
				export default ({ env }) => new Worker({
					dir: '${workerDir}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: ['nodejs_compat'],
					${workerOptions}
				})
			`,
		})

		const { written, writer } = captureWriter()
		const applied: unknown[] = []
		const applier: ResourceApplier = {
			async applyResource(resource) {
				applied.push(resource)
				return undefined
			},
		}
		const run = () => new ResourceProcessor(applier, writer).run({ main: path.join(entryDir, 'oblaka.ts'), env: 'local' })
		const parse = () => JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		const cleanup = async () => {
			await fs.rm(workerDir, { recursive: true })
			await fs.rm(entryDir, { recursive: true })
		}
		return { run, parse, written, applied, cleanup }
	}

	test('fails before applying anything when a durable object is removed without being listed for deletion', async () => {
		const fixture = await doFixture(`bindings: {
			CACHE: new KVNamespace({ name: 'cache' }),
			DO: new DurableObject({ name: 'my-do', className: 'MyDO' }),
		},`)
		try {
			await expect(fixture.run()).rejects.toThrow("Durable Object class 'OldDO' is no longer bound")
			expect(fixture.applied).toHaveLength(0)
			expect(fixture.written).toHaveLength(0)
		} finally {
			await fixture.cleanup()
		}
	})

	test('leaves alone a live class that was not bound in the previous config', async () => {
		const fixture = await doFixture(`bindings: { DO: new DurableObject({ name: 'my-do', className: 'MyDO' }) },`, {
			...defaultExistingDoConfig,
			durable_objects: { bindings: [{ name: 'DO', class_name: 'MyDO' }] },
		})
		try {
			await fixture.run()
			expect(fixture.parse().migrations).toEqual(defaultExistingDoConfig.migrations)
		} finally {
			await fixture.cleanup()
		}
	})

	test('deletes a durable object listed in deletedDurableObjects', async () => {
		const fixture = await doFixture(`
			deletedDurableObjects: ['OldDO'],
			bindings: { DO: new DurableObject({ name: 'my-do', className: 'MyDO' }) },
		`)
		try {
			await fixture.run()
			expect(fixture.parse().migrations).toEqual([
				{ tag: 'v0001', new_sqlite_classes: ['MyDO'] },
				{ tag: 'v0003', deleted_classes: ['OldDO'] },
			])
		} finally {
			await fixture.cleanup()
		}
	})

	test('keeps a longer history intact when deleting a durable object', async () => {
		const migrations = [
			{ tag: 'v0001', new_sqlite_classes: ['MyDO', 'OldDO'] },
			{ tag: 'v0002', deleted_classes: ['OldDO'] },
			{ tag: 'v0003', new_sqlite_classes: ['OldDO'] },
		]
		const fixture = await doFixture(
			`
			deletedDurableObjects: ['OldDO'],
			bindings: { DO: new DurableObject({ name: 'my-do', className: 'MyDO' }) },
		`,
			{ ...defaultExistingDoConfig, migrations },
		)
		try {
			await fixture.run()
			expect(fixture.parse().migrations).toEqual([...migrations, { tag: 'v0004', deleted_classes: ['OldDO'] }])
		} finally {
			await fixture.cleanup()
		}
	})

	test('deletes a removed durable object when deleteDurableObjectsOnRemoval is true', async () => {
		const fixture = await doFixture(`
			deleteDurableObjectsOnRemoval: true,
			bindings: { DO: new DurableObject({ name: 'my-do', className: 'MyDO' }) },
		`)
		try {
			await fixture.run()
			expect(fixture.parse().migrations.at(-1)).toEqual({ tag: 'v0003', deleted_classes: ['OldDO'] })
		} finally {
			await fixture.cleanup()
		}
	})

	test('keeps an already deleted durable object deleted without a new migration', async () => {
		const fixture = await doFixture(
			`
			deletedDurableObjects: ['OldDO'],
			bindings: { DO: new DurableObject({ name: 'my-do', className: 'MyDO' }) },
		`,
			{
				name: 'test-worker',
				durable_objects: { bindings: [{ name: 'DO', class_name: 'MyDO' }] },
				migrations: [
					{ tag: 'v0001', new_sqlite_classes: ['MyDO'] },
					{ tag: 'v0003', deleted_classes: ['OldDO'] },
				],
			},
		)
		try {
			await fixture.run()
			expect(fixture.parse().migrations).toHaveLength(2)
		} finally {
			await fixture.cleanup()
		}
	})

	test('fails when a durable object is both bound and listed in deletedDurableObjects', async () => {
		const fixture = await doFixture(`
			deletedDurableObjects: ['MyDO', 'OldDO'],
			bindings: { DO: new DurableObject({ name: 'my-do', className: 'MyDO' }) },
		`)
		try {
			await expect(fixture.run()).rejects.toThrow("'MyDO' is listed in deletedDurableObjects but bound")
		} finally {
			await fixture.cleanup()
		}
	})

	test('renames a durable object with renamedFrom instead of deleting it', async () => {
		const fixture = await doFixture(`
			bindings: {
				DO: new DurableObject({ name: 'my-do', className: 'MyDO' }),
				NEW_DO: new DurableObject({ name: 'new-do', className: 'NewDO', renamedFrom: 'OldDO' }),
			},
		`)
		try {
			await fixture.run()
			expect(fixture.parse().migrations).toEqual([
				...defaultExistingDoConfig.migrations,
				{ tag: 'v0003', renamed_classes: [{ from: 'OldDO', to: 'NewDO' }] },
			])
		} finally {
			await fixture.cleanup()
		}
	})

	test('fails when renamedFrom names a class that is still bound', async () => {
		const fixture = await doFixture(`
			bindings: {
				OLD_DO: new DurableObject({ name: 'old-do', className: 'OldDO' }),
				NEW_DO: new DurableObject({ name: 'new-do', className: 'NewDO', renamedFrom: 'OldDO' }),
			},
			deleteDurableObjectsOnRemoval: false,
		`)
		try {
			await expect(fixture.run()).rejects.toThrow("is renamed from 'OldDO', which is still bound")
		} finally {
			await fixture.cleanup()
		}
	})

	test('fails when two classes are renamed from the same class', async () => {
		const fixture = await doFixture(`
			bindings: {
				DO: new DurableObject({ name: 'my-do', className: 'MyDO' }),
				A: new DurableObject({ name: 'a', className: 'A', renamedFrom: 'OldDO' }),
				B: new DurableObject({ name: 'b', className: 'B', renamedFrom: 'OldDO' }),
			},
		`)
		try {
			await expect(fixture.run()).rejects.toThrow("'A' and 'B' are both renamed from 'OldDO'")
		} finally {
			await fixture.cleanup()
		}
	})

	test('fails before writing any config when a child worker removes a durable object', async () => {
		const childDir = await createFixtureDir({ 'wrangler.jsonc': JSON.stringify(defaultExistingDoConfig) })
		const parentDir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				export default ({ env }) => new Worker({
					dir: '${path.resolve('.')}'.replace(/\\\\/g, '/'),
					name: 'parent',
					compatibility_flags: [],
					bindings: {
						CHILD: new Worker({
							dir: '${childDir}'.replace(/\\\\/g, '/'),
							name: 'child',
							compatibility_flags: [],
							bindings: {},
						}),
					},
				})
			`,
		})
		const { written, writer } = captureWriter()
		try {
			await expect(new ResourceProcessor(noopApplier, writer).run({ main: path.join(parentDir, 'oblaka.ts'), env: 'local' }))
				.rejects.toThrow("Worker 'child'")
			expect(written).toHaveLength(0)
		} finally {
			await fs.rm(childDir, { recursive: true })
			await fs.rm(parentDir, { recursive: true })
		}
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

	test('skips bindings set to false, null or undefined', async () => {
		const dir = await createFixtureDir({
			'oblaka.ts': `
				import { Worker } from '${path.resolve('src/resources/worker')}'
				import { KVNamespace } from '${path.resolve('src/resources/kv')}'
				export default ({ env }) => new Worker({
					dir: '${path.resolve('.')}'.replace(/\\\\/g, '/'),
					name: 'test-worker',
					compatibility_flags: [],
					bindings: {
						CACHE: new KVNamespace({ name: 'cache' }),
						OFF: env === 'production' && new KVNamespace({ name: 'off' }),
						NONE: null,
						MISSING: undefined,
					},
				})
			`,
		})

		const { written, writer } = captureWriter()
		await new ResourceProcessor(noopApplier, writer).run({ main: path.join(dir, 'oblaka.ts'), env: 'local' })

		const config = JSON.parse(written[0].content.replace(/\/\*\*[\s\S]*?\*\/\n/, ''))
		expect(config.kv_namespaces.map((kv: { binding: string }) => kv.binding)).toEqual(['CACHE'])

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
