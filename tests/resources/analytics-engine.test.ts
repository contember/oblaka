import { describe, expect, test } from 'bun:test'
import { AnalyticsEngine } from '../../src/resources/analytics-engine'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('AnalyticsEngine', () => {
	describe('getId', () => {
		test('returns analytics_engine resource kind', () => {
			const ae = new AnalyticsEngine({ name: 'my-dataset' })
			expect(ae.getId()).toEqual({ resource: 'analytics_engine', id: 'my-dataset' })
		})
	})

	describe('apply', () => {
		test('returns existing state if present', async () => {
			const ae = new AnalyticsEngine({ name: 'my-dataset' })
			const result = await ae.apply({ state: { name: 'existing' } })
			expect(result).toEqual({ name: 'existing' })
		})

		test('returns new state with name if no state', async () => {
			const ae = new AnalyticsEngine({ name: 'my-dataset' })
			const result = await ae.apply({})
			expect(result).toEqual({ name: 'my-dataset' })
		})
	})

	describe('configureBinding', () => {
		test('adds analytics engine dataset binding', () => {
			const ae = new AnalyticsEngine({ name: 'my-dataset' })
			const config = ae.configureBinding({ config: emptyConfig, binding: 'AE', env: 'local' })

			expect(config.analytics_engine_datasets).toEqual([{
				binding: 'AE',
				dataset: 'my-dataset',
			}])
		})

		test('appends to existing datasets', () => {
			const ae = new AnalyticsEngine({ name: 'second-dataset' })
			const existing = {
				analytics_engine_datasets: [{ binding: 'AE1', dataset: 'first-dataset' }],
			} as Config
			const config = ae.configureBinding({ config: existing, binding: 'AE2', env: 'local' })

			expect(config.analytics_engine_datasets).toHaveLength(2)
		})
	})
})
