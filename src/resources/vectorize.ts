import type { BindableResource, Config, Context, ResourceDestroyer } from '../types'

export type VectorizeMetric = 'cosine' | 'euclidean' | 'dot-product'

export interface VectorizeIndexState {
	name: string
}

export class VectorizeIndex implements BindableResource<VectorizeIndexState> {
	constructor(
		public readonly options: {
			name: string
			config: {
				dimensions: number
				metric: VectorizeMetric
			}
		},
	) {}

	getId() {
		return {
			resource: 'vectorize_index' as const,
			id: this.options.name,
		}
	}

	configureBinding(args: { config: Config; binding: string; state?: VectorizeIndexState; env: string }): Config {
		return {
			...args.config,
			vectorize: [
				...args.config?.vectorize ?? [],
				{
					binding: args.binding,
					index_name: args.state?.name || this.options.name,
				},
			],
		}
	}

	async apply(args: { state?: VectorizeIndexState; context: Context; dryRun: boolean }): Promise<VectorizeIndexState> {
		if (args.state) {
			return args.state
		}
		const remoteName = `${args.context.env}-${this.options.name}`

		if (args.dryRun) {
			return {
				name: remoteName,
			}
		}

		await args.context.client.fetch({
			url: `/vectorize/v2/indexes`,
			method: 'POST',
			body: {
				name: remoteName,
				config: this.options.config,
			},
		})
		return {
			name: remoteName,
		}
	}
}

export const VectorizeIndexDestroyer: ResourceDestroyer<VectorizeIndexState> = async (args): Promise<void> => {
	await args.context.client.fetch({
		url: `/vectorize/v2/indexes/${args.state.name}`,
		method: 'DELETE',
	})
}
