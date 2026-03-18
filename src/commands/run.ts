#!/usr/bin/env bun
import { CloudflareConfigureExecutor } from './configure'
import { CloudflareDeployExecutor } from './deploy'
import { input } from './input'
import { registerSignalHandler } from './utils/pm'

registerSignalHandler()

if (input.remote) {
	await CloudflareDeployExecutor.execute({ input })
} else {
	await CloudflareConfigureExecutor.execute({ input })
}
