import type { Bindable, Config } from '../types'

export class AiGateway implements Bindable {
	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		return {
			...args.config,
			ai: { binding: args.binding },
		}
	}
}
