import type { BindableResource, Config, Context } from '../types'

export interface AnalyticsEngineState {
	name: string
}

/**
 * Cloudflare Analytics Engine binding
 * https://developers.cloudflare.com/analytics/analytics-engine/
 */
export class AnalyticsEngine implements BindableResource<AnalyticsEngineState> {
	constructor(
		public readonly options: {
			name: string
		},
	) {}

	getId() {
		return {
			resource: 'analytics_engine' as const,
			id: this.options.name,
		}
	}

	configureBinding(args: { config: Config; binding: string; state?: AnalyticsEngineState; env: string }): Config {
		return {
			...args.config,
			analytics_engine_datasets: [
				...(args.config as any)?.analytics_engine_datasets ?? [],
				{
					binding: args.binding,
					dataset: this.options.name,
				},
			],
		}
	}

	async apply(args: { state?: AnalyticsEngineState; context: Context; dryRun: boolean }): Promise<AnalyticsEngineState> {
		// Analytics Engine datasets are created automatically when first used
		// No API call needed for creation
		return args.state ?? {
			name: this.options.name,
		}
	}
}
