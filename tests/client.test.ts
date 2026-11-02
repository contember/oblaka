import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { CloudflareClient } from '../src/client'

const ok = (result: unknown) => Response.json({ success: true, errors: [], messages: [], result })
const unauthorized = () =>
	Response.json({ result: null, success: false, errors: [{ code: 10000, message: 'Authentication error' }], messages: [] }, {
		status: 401,
		statusText: 'Unauthorized',
	})

const authHeaders: string[] = []
const bodies: (BodyInit | null | undefined)[] = []

const mockFetch = (responses: Response[]) => {
	authHeaders.length = 0
	bodies.length = 0
	return spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
		authHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
		bodies.push(init?.body)
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

	test('retries a POST with the same body', async () => {
		spy = mockFetch([unauthorized(), ok({ id: 'ns' })])
		const client = new CloudflareClient({ accountId: 'acc', getToken: async () => 'stale', refreshToken: async () => 'fresh' })

		await client.fetch({ method: 'POST', url: '/storage/kv/namespaces', body: { title: 'state' } })
		expect(bodies).toEqual(['{"title":"state"}', '{"title":"state"}'])
	})

	test('keeps the request context when the refresh itself fails', async () => {
		spy = mockFetch([unauthorized()])
		const client = new CloudflareClient({
			accountId: 'acc',
			getToken: async () => 'stale',
			refreshToken: async () => {
				throw new Error('Failed to refresh Cloudflare OAuth token (400)')
			},
		})

		const failed = client.fetch({ method: 'GET', url: '/storage/kv/namespaces' })
		await expect(failed).rejects.toThrow('/storage/kv/namespaces')
		await expect(failed).rejects.toThrow('Failed to refresh Cloudflare OAuth token (400)')
		expect(authHeaders).toHaveLength(1)
	})
})
