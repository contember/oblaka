import type { BindableResource, Config, Context, ResourceDestroyer } from '../types'

export interface QueueState {
	id: string
	name: string
}

type QueueBindingMode = 'producer' | 'consumer' | 'both'

interface QueueProducerBindingOptions {
	deliveryDelay?: number
	remote?: boolean
}

interface QueueConsumerBindingOptions {
	type?: string
	maxBatchSize?: number
	maxBatchTimeout?: number
	maxRetries?: number
	deadLetterQueue?: string
	maxConcurrency?: number | null
	visibilityTimeoutMs?: number
	retryDelay?: number
}

export class Queue implements BindableResource<QueueState> {
	constructor(
		public readonly options: {
			name: string
			binding?: QueueBindingMode
			producer?: QueueProducerBindingOptions | false
			consumer?: QueueConsumerBindingOptions
		},
	) {}

	public getId() {
		return {
			resource: 'queue' as const,
			id: this.options.name,
		}
	}

	public async apply(args: { state?: QueueState; context: Context; dryRun: boolean }): Promise<QueueState> {
		if (args.state) {
			return args.state
		}
		const remoteName = `${args.context.env}-${this.options.name}`

		if (args.dryRun) {
			return {
				id: 'dry-run-id-' + Math.random().toString(36).substring(2, 11),
				name: remoteName,
			}
		}

		const result = await args.context.client.fetch<{ queue_id: string }>({
			url: `/queues`,
			method: 'POST',
			body: {
				queue_name: remoteName,
			},
		})
		return {
			id: result.queue_id,
			name: remoteName,
		}
	}

	public configureBinding(args: { config: Config; binding: string; state?: QueueState; env: string }): Config {
		const queueName = args.state?.name ?? this.options.name
		const producer = this.getProducerConfig(args.binding, queueName)
		const consumer = this.getConsumerConfig(queueName)
		return {
			...args.config,
			queues: {
				...args.config.queues,
				producers: [
					...args.config.queues?.producers || [],
					...(producer ? [producer] : []),
				],
				consumers: [
					...args.config.queues?.consumers || [],
					...(consumer ? [consumer] : []),
				],
			},
		}
	}

	private getProducerConfig(binding: string, queueName: string): Exclude<Exclude<Config['queues'], undefined>['producers'], undefined>[0] | null {
		const includeProducer = this.options.binding
			? this.options.binding === 'producer' || this.options.binding === 'both'
			: this.options.producer !== false
		if (!includeProducer) {
			return null
		}
		const producerOptions = typeof this.options.producer === 'object' && this.options.producer !== null
			? this.options.producer
			: {}
		return {
			binding,
			queue: queueName,
			...(producerOptions.deliveryDelay !== undefined ? { delivery_delay: producerOptions.deliveryDelay } : {}),
			...(producerOptions.remote !== undefined ? { remote: producerOptions.remote } : {}),
		}
	}

	private getConsumerConfig(queueName: string): Exclude<Exclude<Config['queues'], undefined>['consumers'], undefined>[0] | null {
		const includeConsumer = this.options.binding
			? this.options.binding === 'consumer' || this.options.binding === 'both'
			: this.options.consumer !== undefined
		if (!includeConsumer) {
			return null
		}
		const consumerOptions = this.options.consumer ?? {}
		return {
			queue: queueName,
			...(consumerOptions.type ? { type: consumerOptions.type } : {}),
			...(consumerOptions.maxBatchSize !== undefined ? { max_batch_size: consumerOptions.maxBatchSize } : {}),
			...(consumerOptions.maxBatchTimeout !== undefined ? { max_batch_timeout: consumerOptions.maxBatchTimeout } : {}),
			...(consumerOptions.maxRetries !== undefined ? { max_retries: consumerOptions.maxRetries } : {}),
			...(consumerOptions.deadLetterQueue !== undefined ? { dead_letter_queue: consumerOptions.deadLetterQueue } : {}),
			...(consumerOptions.maxConcurrency !== undefined ? { max_concurrency: consumerOptions.maxConcurrency } : {}),
			...(consumerOptions.visibilityTimeoutMs !== undefined ? { visibility_timeout_ms: consumerOptions.visibilityTimeoutMs } : {}),
			...(consumerOptions.retryDelay !== undefined ? { retry_delay: consumerOptions.retryDelay } : {}),
		}
	}
}

export const QueueDestroyer: ResourceDestroyer<QueueState> = async (args): Promise<void> => {
	await args.context.client.fetch({
		url: `/queues/${args.state.id}`,
		method: 'DELETE',
	})
}
