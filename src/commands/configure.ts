import type { Input } from './input'
import { ResourceProcessor } from './resource-processor'

export class CloudflareConfigureExecutor {
	public static async execute({ input }: {
		input: Input
	}) {
		const executor = new CloudflareConfigureExecutor(input)
		await executor.run()
	}

	private constructor(
		private readonly input: Input,
	) {
	}

	private async run() {
		const resourceProcessor = new ResourceProcessor({
			applyResource: () => Promise.resolve(undefined),
		})
		await resourceProcessor.run({ main: this.input.main, env: this.input.env })
	}
}
