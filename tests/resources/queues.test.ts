import { describe, expect, test } from 'bun:test'
import { Queue } from '../../src/resources/queues'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('Queue', () => {
	describe('getId', () => {
		test('returns queue resource kind', () => {
			const queue = new Queue({ name: 'my-queue' })
			expect(queue.getId()).toEqual({ resource: 'queue', id: 'my-queue' })
		})
	})

	describe('configureBinding', () => {
		test('adds producer by default (no binding mode)', () => {
			const queue = new Queue({ name: 'my-queue' })
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.producers).toEqual([{ binding: 'QUEUE', queue: 'my-queue' }])
			expect(config.queues?.consumers).toEqual([])
		})

		test('adds consumer when consumer options specified', () => {
			const queue = new Queue({ name: 'my-queue', consumer: { maxBatchSize: 10 } })
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.producers).toHaveLength(1)
			expect(config.queues?.consumers).toEqual([{ queue: 'my-queue', max_batch_size: 10 }])
		})

		test('producer-only binding mode', () => {
			const queue = new Queue({ name: 'my-queue', binding: 'producer' })
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.producers).toHaveLength(1)
			expect(config.queues?.consumers).toEqual([])
		})

		test('consumer-only binding mode', () => {
			const queue = new Queue({ name: 'my-queue', binding: 'consumer' })
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.producers).toEqual([])
			expect(config.queues?.consumers).toHaveLength(1)
		})

		test('both binding mode', () => {
			const queue = new Queue({ name: 'my-queue', binding: 'both' })
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.producers).toHaveLength(1)
			expect(config.queues?.consumers).toHaveLength(1)
		})

		test('excludes producer when producer is false', () => {
			const queue = new Queue({ name: 'my-queue', producer: false })
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.producers).toEqual([])
		})

		test('includes producer options', () => {
			const queue = new Queue({ name: 'my-queue', producer: { deliveryDelay: 60, remote: true } })
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.producers![0]).toEqual({
				binding: 'QUEUE',
				queue: 'my-queue',
				delivery_delay: 60,
				remote: true,
			})
		})

		test('includes all consumer options', () => {
			const queue = new Queue({
				name: 'my-queue',
				consumer: {
					type: 'http_pull',
					maxBatchSize: 50,
					maxBatchTimeout: 30,
					maxRetries: 3,
					deadLetterQueue: 'dlq',
					maxConcurrency: 5,
					visibilityTimeoutMs: 10000,
					retryDelay: 5,
				},
			})
			const config = queue.configureBinding({ config: emptyConfig, binding: 'QUEUE', env: 'local' })

			expect(config.queues?.consumers![0]).toEqual({
				queue: 'my-queue',
				type: 'http_pull',
				max_batch_size: 50,
				max_batch_timeout: 30,
				max_retries: 3,
				dead_letter_queue: 'dlq',
				max_concurrency: 5,
				visibility_timeout_ms: 10000,
				retry_delay: 5,
			})
		})

		test('uses state name when available', () => {
			const queue = new Queue({ name: 'my-queue' })
			const config = queue.configureBinding({
				config: emptyConfig,
				binding: 'QUEUE',
				state: { id: 'q-123', name: 'prod-my-queue' },
				env: 'production',
			})

			expect(config.queues?.producers![0].queue).toBe('prod-my-queue')
		})

		test('appends to existing queues config', () => {
			const queue = new Queue({ name: 'second-queue' })
			const existing = {
				queues: {
					producers: [{ binding: 'Q1', queue: 'first-queue' }],
					consumers: [],
				},
			} as Config
			const config = queue.configureBinding({ config: existing, binding: 'Q2', env: 'local' })

			expect(config.queues?.producers).toHaveLength(2)
		})
	})
})
