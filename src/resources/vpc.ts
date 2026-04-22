import type { Bindable, Config } from '../types'

export type VpcNetworkOptions =
	| { networkId: string; remote?: boolean }
	| { tunnelId: string; remote?: boolean }

export class VpcNetwork implements Bindable {
	constructor(
		private readonly options: VpcNetworkOptions,
	) {}

	static mesh(options?: { remote?: boolean }): VpcNetwork {
		return new VpcNetwork({ networkId: 'cf1:network', remote: options?.remote })
	}

	static tunnel(tunnelId: string, options?: { remote?: boolean }): VpcNetwork {
		return new VpcNetwork({ tunnelId, remote: options?.remote })
	}

	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		return {
			...args.config,
			vpc_networks: [
				...(args.config.vpc_networks ?? []),
				{
					binding: args.binding,
					network_id: 'networkId' in this.options ? this.options.networkId : undefined,
					tunnel_id: 'tunnelId' in this.options ? this.options.tunnelId : undefined,
					remote: this.options.remote ?? true,
				},
			],
		}
	}
}
