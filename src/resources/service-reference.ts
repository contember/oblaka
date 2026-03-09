import type { Bindable, Config } from '../types'

/**
 * Reference to another worker service by name.
 * Used when a child worker needs to call back to its parent or another worker.
 */
export class ServiceReference implements Bindable {
	constructor(
		private readonly serviceName: string,
		private readonly entrypoint?: string,
	) {}

	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		const remoteName = `${args.env}-${this.serviceName}`
		return {
			...args.config,
			services: [
				...(args.config.services ?? []),
				{
					binding: args.binding,
					service: remoteName,
					entrypoint: this.entrypoint,
				},
			],
		}
	}
}
