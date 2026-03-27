import { describe, expect, test } from 'bun:test'
import { DurableObject } from '../../src/resources/do'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('DurableObject', () => {
	describe('getId', () => {
		test('returns durable_object resource kind', () => {
			const doObj = new DurableObject({ name: 'my-do', className: 'MyDO' })
			expect(doObj.getId()).toEqual({ resource: 'durable_object', id: 'my-do' })
		})
	})

	describe('apply', () => {
		test('returns existing state if present', async () => {
			const doObj = new DurableObject({ name: 'my-do', className: 'MyDO' })
			const state = { name: 'existing' }
			const result = await doObj.apply({ state } as any)
			expect(result).toEqual({ name: 'existing' })
		})

		test('returns new state with name if no state', async () => {
			const doObj = new DurableObject({ name: 'my-do', className: 'MyDO' })
			const result = await doObj.apply({} as any)
			expect(result).toEqual({ name: 'my-do' })
		})
	})

	describe('configureBinding', () => {
		test('adds durable object binding and migration', () => {
			const doObj = new DurableObject({ name: 'my-do', className: 'MyDO' })
			const config = doObj.configureBinding({ config: emptyConfig, binding: 'DO', env: 'local' })

			expect(config.durable_objects?.bindings).toEqual([{ name: 'DO', class_name: 'MyDO' }])
			expect(config.migrations).toEqual([{ tag: 'v0001', new_sqlite_classes: ['MyDO'] }])
		})

		test('does not duplicate migration if class already exists in migrations', () => {
			const doObj = new DurableObject({ name: 'my-do', className: 'MyDO' })
			const existing = {
				migrations: [{ tag: 'v0001', new_sqlite_classes: ['MyDO'] }],
			} as Config
			const config = doObj.configureBinding({ config: existing, binding: 'DO', env: 'local' })

			expect(config.migrations).toHaveLength(1)
			expect(config.migrations![0].tag).toBe('v0001')
		})

		test('adds new migration when class not in existing migrations', () => {
			const doObj = new DurableObject({ name: 'my-do', className: 'NewDO' })
			const existing = {
				migrations: [{ tag: 'v0001', new_sqlite_classes: ['OtherDO'] }],
			} as Config
			const config = doObj.configureBinding({ config: existing, binding: 'DO', env: 'local' })

			expect(config.migrations).toHaveLength(2)
			expect(config.migrations![1]).toEqual({ tag: 'v0002', new_sqlite_classes: ['NewDO'] })
		})

		test('appends to existing durable object bindings', () => {
			const doObj = new DurableObject({ name: 'my-do', className: 'MyDO' })
			const existing = {
				durable_objects: { bindings: [{ name: 'OTHER', class_name: 'OtherDO' }] },
				migrations: [{ tag: 'v0001', new_sqlite_classes: ['OtherDO'] }],
			} as Config
			const config = doObj.configureBinding({ config: existing, binding: 'DO', env: 'local' })

			expect(config.durable_objects?.bindings).toHaveLength(2)
		})
	})
})
