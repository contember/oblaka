import type { Bindable, Config } from '../types'

export class Browser implements Bindable {
	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		return {
			...args.config,
			browser: { binding: args.binding },
		}
	}
}
