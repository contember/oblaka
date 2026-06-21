import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Cloudflare's REST API accepts an OAuth access token as a Bearer token, exactly
// like an API token. So to support `wrangler login`-style auth we only need to
// read (and refresh) the credentials wrangler already stores on disk and hand
// the access token to CloudflareClient. The constants below mirror wrangler so
// the refresh flow stays compatible with the same default.toml.

const DEFAULT_CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7'
const EXPIRY_BUFFER_MS = 10_000

export interface WranglerCredentials {
	oauthToken: string
	refreshToken: string
	/** ISO timestamp of when `oauthToken` expires. */
	expirationTime: string
	/** Raw `scopes = [...]` line, preserved verbatim so write-back stays faithful. */
	scopesLine?: string
}

/**
 * Mirrors wrangler's `getGlobalWranglerConfigPath()`: prefer the legacy
 * `~/.wrangler` directory when it exists, otherwise the platform XDG config dir.
 */
export function getWranglerConfigPath(): string {
	const legacy = path.join(os.homedir(), '.wrangler')
	const dir = isDirectory(legacy) ? legacy : xdgWranglerDir()
	return path.join(dir, 'config', 'default.toml')
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory()
	} catch {
		return false
	}
}

function xdgWranglerDir(): string {
	const home = os.homedir()
	const name = '.wrangler'
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
		return path.join(appData, 'xdg.config', name)
	}
	if (process.platform === 'darwin') {
		return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, 'Library', 'Preferences'), name)
	}
	return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), name)
}

export function parseWranglerCredentials(toml: string): WranglerCredentials | null {
	const str = (key: string) => toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1]
	const oauthToken = str('oauth_token')
	const refreshToken = str('refresh_token')
	const expirationTime = str('expiration_time')
	if (!oauthToken || !refreshToken || !expirationTime) {
		return null
	}
	const scopesLine = toml.match(/^\s*scopes\s*=.*$/m)?.[0]
	return { oauthToken, refreshToken, expirationTime, scopesLine }
}

export function readWranglerCredentials(configPath = getWranglerConfigPath()): WranglerCredentials | null {
	let contents: string
	try {
		contents = fs.readFileSync(configPath, 'utf8')
	} catch {
		return null
	}
	return parseWranglerCredentials(contents)
}

export function hasWranglerCredentials(configPath?: string): boolean {
	return readWranglerCredentials(configPath) !== null
}

function serializeWranglerCredentials(creds: WranglerCredentials): string {
	const lines = [
		`oauth_token = "${creds.oauthToken}"`,
		`expiration_time = "${creds.expirationTime}"`,
		`refresh_token = "${creds.refreshToken}"`,
	]
	if (creds.scopesLine) {
		lines.push(creds.scopesLine)
	}
	return `${lines.join('\n')}\n`
}

function writeWranglerCredentials(configPath: string, creds: WranglerCredentials): void {
	// Write to a sibling temp file then rename so a crash can't leave wrangler's
	// credentials file half-written.
	const tmp = `${configPath}.${process.pid}.tmp`
	fs.writeFileSync(tmp, serializeWranglerCredentials(creds), { mode: 0o600 })
	fs.renameSync(tmp, configPath)
}

interface TokenEndpointResponse {
	access_token: string
	expires_in: number
	refresh_token?: string
}

interface RefreshDeps {
	fetch?: typeof fetch
	tokenUrl?: string
	clientId?: string
	now?: () => number
}

export async function refreshAccessToken(
	refreshToken: string,
	deps: RefreshDeps = {},
): Promise<Pick<WranglerCredentials, 'oauthToken' | 'refreshToken' | 'expirationTime'>> {
	const doFetch = deps.fetch ?? fetch
	const tokenUrl = deps.tokenUrl ?? tokenUrlFromEnv()
	const clientId = deps.clientId ?? (process.env.WRANGLER_CLIENT_ID || DEFAULT_CLIENT_ID)
	const now = deps.now ?? Date.now

	const response = await doFetch(tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: clientId,
		}).toString(),
	})
	if (!response.ok) {
		throw new Error(
			`Failed to refresh Cloudflare OAuth token (${response.status}). Run \`wrangler login\` to re-authenticate.`,
		)
	}
	const data = (await response.json()) as TokenEndpointResponse
	return {
		oauthToken: data.access_token,
		// Cloudflare may rotate the refresh token; fall back to the existing one.
		refreshToken: data.refresh_token ?? refreshToken,
		expirationTime: new Date(now() + data.expires_in * 1000).toISOString(),
	}
}

function tokenUrlFromEnv(): string {
	if (process.env.WRANGLER_TOKEN_URL) {
		return process.env.WRANGLER_TOKEN_URL
	}
	const domain = process.env.WRANGLER_AUTH_DOMAIN || 'dash.cloudflare.com'
	return `https://${domain}/oauth2/token`
}

export interface WranglerTokenProviderOptions {
	configPath?: string
	now?: () => number
	fetch?: typeof fetch
	/** Persist the refreshed token back to default.toml (default true). */
	persist?: boolean
}

/**
 * Returns a token provider backed by wrangler's stored OAuth credentials. It
 * returns the access token while valid, refreshing (and persisting) it once it
 * is within the expiry buffer. The result is cached in memory for the process.
 */
export function createWranglerTokenProvider(options: WranglerTokenProviderOptions = {}): () => Promise<string> {
	const configPath = options.configPath ?? getWranglerConfigPath()
	const now = options.now ?? Date.now
	const persist = options.persist ?? true
	let cached: { token: string; expiresAt: number } | null = null

	return async () => {
		if (cached && cached.expiresAt - EXPIRY_BUFFER_MS > now()) {
			return cached.token
		}
		const creds = readWranglerCredentials(configPath)
		if (!creds) {
			throw new Error(
				`No Cloudflare credentials found. Set CLOUDFLARE_API_TOKEN, or run \`wrangler login\` (looked in ${configPath}).`,
			)
		}
		const expiresAt = Date.parse(creds.expirationTime)
		if (Number.isFinite(expiresAt) && expiresAt - EXPIRY_BUFFER_MS > now()) {
			cached = { token: creds.oauthToken, expiresAt }
			return creds.oauthToken
		}

		const refreshed = await refreshAccessToken(creds.refreshToken, { fetch: options.fetch, now })
		if (persist) {
			try {
				writeWranglerCredentials(configPath, { ...creds, ...refreshed })
			} catch (error) {
				console.warn(`Warning: refreshed Cloudflare OAuth token but could not persist it to ${configPath}: ${error}`)
			}
		}
		cached = { token: refreshed.oauthToken, expiresAt: Date.parse(refreshed.expirationTime) }
		return refreshed.oauthToken
	}
}
