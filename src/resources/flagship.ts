import type { Bindable, Config } from '../types'

export class Flagship implements Bindable {
	constructor(
		private readonly options: {
			appId: string
		},
	) {}

	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		return {
			...args.config,
			flagship: [
				...(args.config.flagship ?? []),
				{
					binding: args.binding,
					app_id: this.options.appId,
				},
			],
		}
	}
}
