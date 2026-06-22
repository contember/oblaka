#!/usr/bin/env bun
import { hasWranglerCredentials } from '../auth'
import { CloudflareConfigureExecutor } from './configure'
import { CloudflareDeployExecutor } from './deploy'
import { input } from './input'
import { loadDefinition } from './load-definition'
import { registerSignalHandler } from './utils/pm'
import { CloudflareValidateExecutor } from './validate'

registerSignalHandler()

if (input.validate) {
	await CloudflareValidateExecutor.execute({ input })
} else if (input.remote) {
	if (!input.accountId) {
		console.error('Missing --account-id or CLOUDFLARE_ACCOUNT_ID environment variable')
		process.exit(1)
	}
	if (!input.apiToken && !hasWranglerCredentials()) {
		console.error('Missing credentials: set --api-token / CLOUDFLARE_API_TOKEN, or run `wrangler login` for OAuth')
		process.exit(1)
	}
	const definition = await loadDefinition({ main: input.main, env: input.env })
	await CloudflareDeployExecutor.execute({ input, definition })
} else {
	await CloudflareConfigureExecutor.execute({ input })
}
