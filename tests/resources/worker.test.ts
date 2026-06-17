import { describe, expect, test } from 'bun:test'
import { Worker } from '../../src/resources/worker'
import type { Config } from '../../src/types'
import { mockContext } from '../helpers/mock-client'

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
	describe('apply', () => {
		test('returns existing state without any remote call', async () => {
			const worker = createWorker()
			const { context, calls } = mockContext({})
			const result = await worker.apply({ state: { id: 'w-1', name: 'production-my-worker' }, context, dryRun: false })
			expect(result).toEqual({ id: 'w-1', name: 'production-my-worker' })
			expect(calls).toHaveLength(0)
		})

		test('adopts an existing remote worker by name instead of failing on create', async () => {
			const worker = createWorker()
			const { context, calls } = mockContext({
				'GET /workers/workers': [{ id: 'w-existing', name: 'production-my-worker' }],
			})
			const result = await worker.apply({ context, dryRun: false })
			expect(result).toEqual({ id: 'w-existing', name: 'production-my-worker' })
			// No create POST — a blind create would return 10040 "already exists".
			expect(calls.some(c => c.method === 'POST')).toBe(false)
		})

		test('creates when no remote worker matches', async () => {
			const worker = createWorker()
			const { context, calls } = mockContext({
				'GET /workers/workers': [],
				'POST /workers/workers': { id: 'w-new' },
				'POST /workers/workers/w-new/versions': {},
			})
			const result = await worker.apply({ context, dryRun: false })
			expect(result).toEqual({ id: 'w-new', name: 'production-my-worker' })
			expect(calls.some(c => c.method === 'POST' && c.url === '/workers/workers')).toBe(true)
		})
	})

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

	describe('constructor option types', () => {
		test('accepts raw wrangler config fields that oblaka does not manage', () => {
			const worker = createWorker({ compatibility_date: '2024-01-01', vars: { FOO: 'bar' } })
			expect(worker.getId()).toEqual({ resource: 'worker', id: 'my-worker' })
		})

		test('rejects oblaka-managed binding fields', () => {
			const worker = createWorker({
				// @ts-expect-error kv_namespaces is managed by the KV resource and must not be set directly
				kv_namespaces: [{ binding: 'KV', id: 'abc' }],
			})
			expect(worker.getId()).toEqual({ resource: 'worker', id: 'my-worker' })
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
