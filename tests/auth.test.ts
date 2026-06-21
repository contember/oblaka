import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createWranglerTokenProvider, parseWranglerCredentials, readWranglerCredentials, refreshAccessToken } from '../src/auth'

const SAMPLE = [
	'oauth_token = "access-123"',
	'expiration_time = "2026-06-21T15:00:00.000Z"',
	'refresh_token = "refresh-123"',
	'scopes = [ "account:read", "user:read" ]',
	'',
].join('\n')

const tmpFiles: string[] = []

function writeTempConfig(contents: string): string {
	const file = path.join(os.tmpdir(), `oblaka-auth-${process.pid}-${tmpFiles.length}.toml`)
	fs.writeFileSync(file, contents)
	tmpFiles.push(file)
	return file
}

function tokenResponse(body: unknown, ok = true, status = 200) {
	return {
		ok,
		status,
		json: async () => body,
	} as unknown as Response
}

afterEach(() => {
	while (tmpFiles.length) {
		try {
			fs.rmSync(tmpFiles.pop() as string)
		} catch {}
	}
})

describe('parseWranglerCredentials', () => {
	test('extracts oauth fields and preserves the scopes line', () => {
		const creds = parseWranglerCredentials(SAMPLE)
		expect(creds).toEqual({
			oauthToken: 'access-123',
			refreshToken: 'refresh-123',
			expirationTime: '2026-06-21T15:00:00.000Z',
			scopesLine: 'scopes = [ "account:read", "user:read" ]',
		})
	})

	test('returns null when a required field is missing', () => {
		expect(parseWranglerCredentials('oauth_token = "x"\n')).toBeNull()
	})
})

describe('readWranglerCredentials', () => {
	test('returns null when the file does not exist', () => {
		expect(readWranglerCredentials(path.join(os.tmpdir(), 'oblaka-missing-xyz.toml'))).toBeNull()
	})
})

describe('refreshAccessToken', () => {
	test('exchanges the refresh token and computes an ISO expiry', async () => {
		let captured: { url: string; body: string } | undefined
		const fetchMock = (async (url: string, init: { body: string }) => {
			captured = { url, body: init.body }
			return tokenResponse({ access_token: 'access-new', expires_in: 3600, refresh_token: 'refresh-new' })
		}) as unknown as typeof fetch

		const result = await refreshAccessToken('refresh-123', {
			fetch: fetchMock,
			tokenUrl: 'https://example.test/oauth2/token',
			clientId: 'client-xyz',
			now: () => Date.parse('2026-06-21T15:00:00.000Z'),
		})

		expect(result).toEqual({
			oauthToken: 'access-new',
			refreshToken: 'refresh-new',
			expirationTime: '2026-06-21T16:00:00.000Z',
		})
		expect(captured?.url).toBe('https://example.test/oauth2/token')
		expect(captured?.body).toContain('grant_type=refresh_token')
		expect(captured?.body).toContain('refresh_token=refresh-123')
		expect(captured?.body).toContain('client_id=client-xyz')
	})

	test('keeps the existing refresh token when the response omits one', async () => {
		const fetchMock = (async () => tokenResponse({ access_token: 'access-new', expires_in: 3600 })) as unknown as typeof fetch
		const result = await refreshAccessToken('refresh-123', { fetch: fetchMock, now: () => 0 })
		expect(result.refreshToken).toBe('refresh-123')
	})

	test('throws a helpful error on a non-ok response', async () => {
		const fetchMock = (async () => tokenResponse({}, false, 401)) as unknown as typeof fetch
		await expect(refreshAccessToken('refresh-123', { fetch: fetchMock })).rejects.toThrow('wrangler login')
	})
})

describe('createWranglerTokenProvider', () => {
	test('returns the stored token without refreshing while it is valid', async () => {
		const configPath = writeTempConfig(SAMPLE)
		const fetchMock = (async () => {
			throw new Error('should not refresh')
		}) as unknown as typeof fetch
		const provider = createWranglerTokenProvider({
			configPath,
			fetch: fetchMock,
			now: () => Date.parse('2026-06-21T14:00:00.000Z'),
		})
		expect(await provider()).toBe('access-123')
	})

	test('refreshes and persists when the stored token is expired', async () => {
		const configPath = writeTempConfig(SAMPLE)
		const fetchMock =
			(async () => tokenResponse({ access_token: 'access-new', expires_in: 3600, refresh_token: 'refresh-new' })) as unknown as typeof fetch
		const provider = createWranglerTokenProvider({
			configPath,
			fetch: fetchMock,
			now: () => Date.parse('2026-06-21T16:00:00.000Z'),
		})

		expect(await provider()).toBe('access-new')

		const persisted = readWranglerCredentials(configPath)
		expect(persisted?.oauthToken).toBe('access-new')
		expect(persisted?.refreshToken).toBe('refresh-new')
		// The scopes line survives the rewrite.
		expect(persisted?.scopesLine).toBe('scopes = [ "account:read", "user:read" ]')
	})

	test('throws a helpful error when no credentials file exists', async () => {
		const provider = createWranglerTokenProvider({ configPath: path.join(os.tmpdir(), 'oblaka-none-xyz.toml') })
		await expect(provider()).rejects.toThrow('wrangler login')
	})
})
