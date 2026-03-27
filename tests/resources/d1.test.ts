import { describe, expect, test } from 'bun:test'
import { D1Database } from '../../src/resources/d1'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('D1Database', () => {
	describe('getId', () => {
		test('returns d1_database resource kind', () => {
			const db = new D1Database({ name: 'my-db' })
			expect(db.getId()).toEqual({ resource: 'd1_database', id: 'my-db' })
		})
	})

	describe('configureBinding', () => {
		test('adds d1 binding with name as fallback', () => {
			const db = new D1Database({ name: 'my-db' })
			const config = db.configureBinding({ config: emptyConfig, binding: 'DB', env: 'local' })
			expect(config.d1_databases).toEqual([{
				binding: 'DB',
				database_name: 'my-db',
				database_id: 'my-db',
				migrations_dir: undefined,
			}])
		})

		test('uses state for database name and id', () => {
			const db = new D1Database({ name: 'my-db' })
			const config = db.configureBinding({
				config: emptyConfig,
				binding: 'DB',
				state: { id: 'uuid-123', name: 'prod-my-db' },
				env: 'production',
			})
			expect(config.d1_databases![0].database_name).toBe('prod-my-db')
			expect(config.d1_databases![0].database_id).toBe('uuid-123')
		})

		test('includes migrations dir when specified', () => {
			const db = new D1Database({ name: 'my-db', migrationsDir: './migrations' })
			const config = db.configureBinding({ config: emptyConfig, binding: 'DB', env: 'local' })
			expect(config.d1_databases![0].migrations_dir).toBe('./migrations')
		})

		test('appends to existing d1 databases', () => {
			const db = new D1Database({ name: 'second-db' })
			const existing = { d1_databases: [{ binding: 'DB1', database_name: 'first', database_id: 'id1' }] } as Config
			const config = db.configureBinding({ config: existing, binding: 'DB2', env: 'local' })
			expect(config.d1_databases).toHaveLength(2)
		})
	})
})
