import { parseArgs } from 'node:util'

export const input = (() => {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		allowPositionals: true,
		options: {
			env: { type: 'string' },
			'state-namespace': { type: 'string' },
			'state-namespace-id': { type: 'string' },
			'account-id': { type: 'string' },
			'api-token': { type: 'string' },
			'dry-run': { type: 'boolean' },
			remote: { type: 'boolean' },
			destroy: { type: 'boolean' },
			validate: { type: 'boolean' },
			'out-state': { type: 'string' },
			'no-persist-token': { type: 'boolean' },
		},
	})

	const main = positionals[0]
	if (!main) {
		console.error('Missing config entrypoint argument')
		process.exit(1)
	}

	return {
		main,
		env: values.env || process.env.CLOUDFLARE_ENV || 'local',
		stateNamespace: values['state-namespace'] || 'cf-state',
		stateNamespaceId: values['state-namespace-id'],
		accountId: values['account-id'] || process.env.CLOUDFLARE_ACCOUNT_ID || '',
		apiToken: values['api-token'] || process.env.CLOUDFLARE_API_TOKEN || '',
		dryRun: values['dry-run'] ?? false,
		remote: values.remote ?? false,
		destroy: values.destroy ?? false,
		validate: values.validate ?? false,
		outStatePath: values['out-state'],
		// When using OAuth, persist the refreshed token back to wrangler's config
		// unless the user opts out (e.g. read-only credentials dir).
		persistToken: !(values['no-persist-token'] ?? false),
	}
})()

export type Input = typeof input
