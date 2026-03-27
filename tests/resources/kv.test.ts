import { describe, expect, test } from 'bun:test'
import { KVNamespace } from '../../src/resources/kv'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('KVNamespace', () => {
	describe('getId', () => {
		test('returns kv_namespace resource kind', () => {
			const kv = new KVNamespace({ name: 'my-kv' })
			expect(kv.getId()).toEqual({ resource: 'kv_namespace', id: 'my-kv' })
		})
	})

	describe('configureBinding', () => {
		test('adds kv binding with name as fallback id', () => {
			const kv = new KVNamespace({ name: 'my-kv' })
			const config = kv.configureBinding({ config: emptyConfig, binding: 'KV', env: 'local' })
			expect(config.kv_namespaces).toEqual([{ binding: 'KV', id: 'my-kv' }])
		})

		test('uses state id when available', () => {
			const kv = new KVNamespace({ name: 'my-kv' })
			const config = kv.configureBinding({
				config: emptyConfig,
				binding: 'KV',
				state: { id: 'kv-id-123', name: 'prod-my-kv' },
				env: 'production',
			})
			expect(config.kv_namespaces![0].id).toBe('kv-id-123')
		})

		test('appends to existing kv namespaces', () => {
			const kv = new KVNamespace({ name: 'second-kv' })
			const existing = { kv_namespaces: [{ binding: 'KV1', id: 'id1' }] } as Config
			const config = kv.configureBinding({ config: existing, binding: 'KV2', env: 'local' })
			expect(config.kv_namespaces).toHaveLength(2)
		})
	})
})
