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

// Includes a comment and a hypothetical future field to prove write-back leaves
// unrelated lines intact.
const SAMPLE_WITH_EXTRAS = [
	'# wrangler credentials',
	'oauth_token = "access-123"',
	'expiration_time = "2026-06-21T15:00:00.000Z"',
	'refresh_token = "refresh-123"',
	'scopes = [ "account:read", "user:read" ]',
	'some_future_field = "keep-me"',
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
	test('extracts the oauth fields', () => {
		const creds = parseWranglerCredentials(SAMPLE)
		expect(creds).toEqual({
			oauthToken: 'access-123',
			refreshToken: 'refresh-123',
			expirationTime: '2026-06-21T15:00:00.000Z',
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

	test('throws on a 200 response missing required fields instead of producing a bad token', async () => {
		const fetchMock = (async () => tokenResponse({ access_token: 'access-new' })) as unknown as typeof fetch
		await expect(refreshAccessToken('refresh-123', { fetch: fetchMock })).rejects.toThrow('unexpected response')
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

	test('refreshes and persists in place, preserving unrelated lines', async () => {
		const configPath = writeTempConfig(SAMPLE_WITH_EXTRAS)
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

		// Unrelated lines (comment, scopes, future fields) survive the rewrite.
		const raw = fs.readFileSync(configPath, 'utf8')
		expect(raw).toContain('# wrangler credentials')
		expect(raw).toContain('scopes = [ "account:read", "user:read" ]')
		expect(raw).toContain('some_future_field = "keep-me"')
	})

	test('does not write to the config file when persist is false', async () => {
		const configPath = writeTempConfig(SAMPLE)
		const before = fs.readFileSync(configPath, 'utf8')
		const fetchMock =
			(async () => tokenResponse({ access_token: 'access-new', expires_in: 3600, refresh_token: 'refresh-new' })) as unknown as typeof fetch
		const provider = createWranglerTokenProvider({
			configPath,
			fetch: fetchMock,
			persist: false,
			now: () => Date.parse('2026-06-21T16:00:00.000Z'),
		})

		expect(await provider()).toBe('access-new')
		expect(fs.readFileSync(configPath, 'utf8')).toBe(before)
	})

	test('throws a helpful error when no credentials file exists', async () => {
		const provider = createWranglerTokenProvider({ configPath: path.join(os.tmpdir(), 'oblaka-none-xyz.toml') })
		await expect(provider()).rejects.toThrow('wrangler login')
	})
})
