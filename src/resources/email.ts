import type { Bindable, Config } from '../types'

export class EmailService implements Bindable {
	constructor(
		private readonly options?: {
			destinationAddress?: string
			allowedDestinationAddresses?: string[]
			allowedSenderAddresses?: string[]
			remote?: boolean
		},
	) {}

	configureBinding(args: { config: Config; binding: string; env: string }): Config {
		return {
			...args.config,
			send_email: [
				...(args.config.send_email ?? []),
				{
					name: args.binding,
					destination_address: this.options?.destinationAddress,
					allowed_destination_addresses: this.options?.allowedDestinationAddresses,
					allowed_sender_addresses: this.options?.allowedSenderAddresses,
					remote: this.options?.remote,
				},
			],
		}
	}
}
