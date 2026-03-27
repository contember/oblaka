import { describe, expect, test } from 'bun:test'
import { R2Bucket } from '../../src/resources/r2'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('R2Bucket', () => {
	describe('getId', () => {
		test('returns r2_bucket resource kind', () => {
			const r2 = new R2Bucket({ name: 'my-bucket' })
			expect(r2.getId()).toEqual({ resource: 'r2_bucket', id: 'my-bucket' })
		})
	})

	describe('configureBinding', () => {
		test('adds r2 binding with name as fallback', () => {
			const r2 = new R2Bucket({ name: 'my-bucket' })
			const config = r2.configureBinding({ config: emptyConfig, binding: 'BUCKET', env: 'local' })
			expect(config.r2_buckets).toEqual([{ binding: 'BUCKET', bucket_name: 'my-bucket' }])
		})

		test('uses state name when available', () => {
			const r2 = new R2Bucket({ name: 'my-bucket' })
			const config = r2.configureBinding({
				config: emptyConfig,
				binding: 'BUCKET',
				state: { name: 'prod-my-bucket' },
				env: 'production',
			})
			expect(config.r2_buckets![0].bucket_name).toBe('prod-my-bucket')
		})

		test('appends to existing r2 buckets', () => {
			const r2 = new R2Bucket({ name: 'second-bucket' })
			const existing = { r2_buckets: [{ binding: 'B1', bucket_name: 'first' }] } as Config
			const config = r2.configureBinding({ config: existing, binding: 'B2', env: 'local' })
			expect(config.r2_buckets).toHaveLength(2)
		})
	})
})
