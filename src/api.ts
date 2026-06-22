import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CloudflareDeployExecutor } from './commands/deploy'
import type { Input } from './commands/input'
import type { ConfigWriter, GeneratedConfig } from './commands/resource-processor'
import type { Worker } from './resources'

export type Definition = Worker

export interface DeployOptions {
	accountId: string
	apiToken: string
	env?: string
	stateNamespace?: string
	stateNamespaceId?: string
	dryRun?: boolean
	remote?: boolean
	cwd?: string
}

export interface DeployResult {
	wranglerConfigs: GeneratedConfig[]
	wranglerConfig: GeneratedConfig['config'] | undefined
}

/**
 * Programmatically provision the resources of an already-constructed oblaka definition
 * (the result of `define()` / `new Worker(...)`) against Cloudflare.
 *
 * Unlike the CLI, this skips loading the recipe file and works directly on the in-memory
 * definition. It always returns the generated wrangler config(s); `wrangler.jsonc` is written
 * to disk only when `remote` is set and `dryRun` is not (mirroring the CLI deploy behavior).
 *
 * State is stored in the `cf-state` KV namespace under a per-env key (the `env` value).
 *
 * Note: this does not run `wrangler deploy` — it only provisions resources and returns the
 * config the caller needs to feed to `wrangler deploy` themselves.
 */
export const deploy = async (definition: Definition | undefined, options: DeployOptions): Promise<DeployResult> => {
	const env = options.env || 'local'
	const cwd = options.cwd ?? process.cwd()
	const remote = options.remote ?? false
	const dryRun = options.dryRun ?? false

	const input: Input = {
		main: '',
		env,
		stateNamespace: options.stateNamespace || 'cf-state',
		stateNamespaceId: options.stateNamespaceId,
		accountId: options.accountId,
		apiToken: options.apiToken,
		dryRun,
		remote,
		destroy: false,
		validate: false,
		outStatePath: undefined,
		// Programmatic deploy always supplies an explicit apiToken, so wrangler's
		// OAuth token provider (and its persistence) is never exercised.
		persistToken: false,
	}

	const shouldWrite = remote && !dryRun
	const configWriter: ConfigWriter = async (configPath, content) => {
		if (!shouldWrite) {
			return
		}
		await fs.writeFile(path.resolve(cwd, configPath), content)
	}

	const wranglerConfigs = await CloudflareDeployExecutor.execute({ input, definition, configWriter })

	return {
		wranglerConfigs,
		wranglerConfig: wranglerConfigs[0]?.config,
	}
}
