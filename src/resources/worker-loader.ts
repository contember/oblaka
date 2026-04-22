import type { Bindable, Config } from '../types'

export class WorkerLoader implements Bindable {
	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		return {
			...args.config,
			worker_loaders: [
				...(args.config.worker_loaders ?? []),
				{ binding: args.binding },
			],
		}
	}
}
