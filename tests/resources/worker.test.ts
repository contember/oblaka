import { describe, expect, test } from 'bun:test'
import { Worker } from '../../src/resources/worker'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

const createWorker = (overrides?: Partial<ConstructorParameters<typeof Worker>[0]>) =>
	new Worker({
		dir: './apps/my-worker',
		name: 'my-worker',
		compatibility_flags: ['nodejs_compat'],
		bindings: {},
		...overrides,
	})

describe('Worker', () => {
	describe('getId', () => {
		test('returns worker resource kind and name', () => {
			const worker = createWorker()
			expect(worker.getId()).toEqual({ resource: 'worker', id: 'my-worker' })
		})
	})

	describe('configureSelf', () => {
		test('sets name from options when no state', () => {
			const worker = createWorker()
			const config = worker.configureSelf({ config: emptyConfig })
			expect(config.name).toBe('my-worker')
		})

		test('sets name from state when available', () => {
			const worker = createWorker()
			const config = worker.configureSelf({ config: emptyConfig, state: { id: '123', name: 'prod-my-worker' } })
			expect(config.name).toBe('prod-my-worker')
		})
	})

	describe('configureBinding', () => {
		test('adds service binding for local env', () => {
			const worker = createWorker()
			const config = worker.configureBinding({ config: emptyConfig, binding: 'WORKER', env: 'local' })
			expect(config.services).toEqual([{ binding: 'WORKER', service: 'my-worker' }])
		})

		test('prefixes service name with env for remote env', () => {
			const worker = createWorker()
			const config = worker.configureBinding({ config: emptyConfig, binding: 'WORKER', env: 'production' })
			expect(config.services).toEqual([{ binding: 'WORKER', service: 'production-my-worker' }])
		})

		test('uses state name when available', () => {
			const worker = createWorker()
			const config = worker.configureBinding({
				config: emptyConfig,
				binding: 'WORKER',
				state: { id: '123', name: 'staging-my-worker' },
				env: 'staging',
			})
			expect(config.services).toEqual([{ binding: 'WORKER', service: 'staging-my-worker' }])
		})

		test('appends to existing services', () => {
			const worker = createWorker()
			const existing = { services: [{ binding: 'OTHER', service: 'other' }] } as Config
			const config = worker.configureBinding({ config: existing, binding: 'WORKER', env: 'local' })
			expect(config.services).toHaveLength(2)
		})
	})
})
