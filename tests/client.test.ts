import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { CloudflareClient } from '../src/client'

const ok = (result: unknown) => Response.json({ success: true, errors: [], messages: [], result })
const unauthorized = () =>
	Response.json({ result: null, success: false, errors: [{ code: 10000, message: 'Authentication error' }], messages: [] }, {
		status: 401,
		statusText: 'Unauthorized',
	})

const authHeaders: string[] = []

const mockFetch = (responses: Response[]) => {
	authHeaders.length = 0
	return spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
		authHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
		const next = responses.shift()
		if (!next) {
			throw new Error('unexpected request')
		}
		return next
	})
}

let spy: ReturnType<typeof mockFetch> | undefined

afterEach(() => {
	spy?.mockRestore()
	spy = undefined
})

describe('CloudflareClient 401 handling', () => {
	test('refreshes the token once and retries the request', async () => {
		spy = mockFetch([unauthorized(), ok({ id: 'ns' })])
		const rejected: string[] = []
		const client = new CloudflareClient({
			accountId: 'acc',
			getToken: async () => 'stale',
			refreshToken: async token => {
				rejected.push(token)
				return 'fresh'
			},
		})

		expect(await client.fetch({ method: 'GET', url: '/storage/kv/namespaces' })).toEqual({ id: 'ns' })
		expect(rejected).toEqual(['stale'])
		expect(authHeaders).toEqual(['Bearer stale', 'Bearer fresh'])
	})

	test('fails with a re-login hint when the refreshed token is rejected too', async () => {
		spy = mockFetch([unauthorized(), unauthorized()])
		const client = new CloudflareClient({
			accountId: 'acc',
			getToken: async () => 'stale',
			refreshToken: async () => 'fresh',
		})

		await expect(client.fetch({ method: 'GET', url: '/storage/kv/namespaces' })).rejects.toThrow('wrangler login')
		expect(authHeaders).toHaveLength(2)
	})

	test('does not retry without a refresh hook', async () => {
		spy = mockFetch([unauthorized()])
		const client = new CloudflareClient({ accountId: 'acc', getToken: async () => 'api-token' })

		await expect(client.fetch({ method: 'GET', url: '/storage/kv/namespaces' })).rejects.toThrow('Unauthorized')
		expect(authHeaders).toHaveLength(1)
	})
})
