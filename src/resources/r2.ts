import type { BindableResource, Config, Context, Region, ResourceDestroyer } from '../types'

export interface R2BucketState {
	name: string
}

export class R2Bucket implements BindableResource<R2BucketState> {
	constructor(
		public readonly options: {
			name: string
			locationHint?: Region
		},
	) {}

	configureBinding(args: { config: Config; binding: string; state?: R2BucketState; env: string }): Config {
		return {
			...args.config,
			r2_buckets: [
				...args.config?.r2_buckets ?? [],
				{
					binding: args.binding,
					bucket_name: args.state?.name || this.options.name,
				},
			],
		}
	}

	getId() {
		return {
			resource: 'r2_bucket' as const,
			id: this.options.name,
		}
	}

	async apply(args: { state?: R2BucketState; context: Context; dryRun: boolean }): Promise<R2BucketState> {
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
			url: `/r2/buckets`,
			method: 'POST',
			body: {
				name: remoteName,
				locationHint: this.options.locationHint,
			},
		})
		return {
			name: remoteName,
		}
	}
}

export const R2BucketDestroyer: ResourceDestroyer<R2BucketState> = async (args): Promise<void> => {
	await args.context.client.fetch({
		url: `/r2/buckets/${args.state.name}`,
		method: 'DELETE',
	})
}
