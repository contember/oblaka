import type { Input } from './input'
import { ResourceProcessor } from './resource-processor'
import { tryReadFile } from './utils/fs'

export class CloudflareValidateExecutor {
	public static async execute({ input }: {
		input: Input
	}) {
		const executor = new CloudflareValidateExecutor(input)
		await executor.run()
	}

	private constructor(
		private readonly input: Input,
	) {
	}

	private async run() {
		const mismatches: string[] = []

		const resourceProcessor = new ResourceProcessor(
			{ applyResource: () => Promise.resolve(undefined) },
			async (configPath, content) => {
				const existing = await tryReadFile(configPath)
				if (existing === undefined) {
					mismatches.push(`${configPath}: file does not exist, run the generator first`)
				} else if (existing !== content) {
					mismatches.push(`${configPath}: content is outdated, run the generator to update`)
				}
			},
		)
		await resourceProcessor.run({ main: this.input.main, env: this.input.env })

		if (mismatches.length > 0) {
			console.error('Validation failed:')
			for (const m of mismatches) {
				console.error(`  - ${m}`)
			}
			process.exit(1)
		}

		console.log('Validation passed: all generated configs are up to date.')
	}
}
