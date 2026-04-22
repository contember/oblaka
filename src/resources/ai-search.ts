import type { Bindable, Config } from '../types'

export class AiSearch implements Bindable {
	constructor(
		private readonly options: {
			namespace: string
			remote?: boolean
		},
	) {}

	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		return {
			...args.config,
			ai_search_namespaces: [
				...(args.config.ai_search_namespaces ?? []),
				{
					binding: args.binding,
					namespace: this.options.namespace,
					remote: this.options.remote,
				},
			],
		}
	}
}
