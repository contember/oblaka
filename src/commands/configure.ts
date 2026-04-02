import * as fs from 'node:fs/promises'
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
		const written: string[] = []

		const resourceProcessor = new ResourceProcessor(
			{ applyResource: () => Promise.resolve(undefined) },
			async (configPath, content) => {
				await fs.writeFile(configPath, content)
				written.push(configPath)
			},
		)

		try {
			await resourceProcessor.run({ main: this.input.main, env: this.input.env })
		} catch (error) {
			console.error('Configure failed:', error)
			process.exit(1)
		}

		if (written.length === 0) {
			console.log('No workers found, no configs generated.')
		} else {
			for (const configPath of written) {
				console.log(`wrote ${configPath}`)
			}
			console.log(`Configure complete: generated ${written.length} wrangler config(s).`)
		}
	}
}
