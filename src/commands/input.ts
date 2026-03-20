import { parseArgs } from './utils/args'

const requireString = (value: string | boolean | undefined, name: string): string => {
	if (typeof value === 'string') {
		return value
	}
	throw new Error(`Missing required string argument: ${name}`)
}

export const input = (() => {
	const { named, positional } = parseArgs(process.argv.slice(2))
	return {
		main: requireString(positional[0], 'config entrypoint'),
		env: requireString(named.env || process.env.CLOUDFLARE_ENV || 'local', 'environment'),
		stateNamespace: requireString(named['state-namespace'] || 'cf-state', 'state namespace'),
		configPath: requireString(named.config || 'wrangler.jsonc', 'config path'),
		accountId: requireString(named['account-id'] || process.env.CLOUDFLARE_ACCOUNT_ID || '', 'account id'),
		apiToken: requireString(named['api-token'] || process.env.CLOUDFLARE_API_TOKEN || '', 'api token'),
		dryRun: !!named['dry-run'],
		remote: !!named.remote,
		destroy: !!named.destroy,
		validate: !!named.validate,
		outStatePath: named['out-state'] === true ? 'out-state.json' : named['out-state'],
	}
})()

export type Input = typeof input
