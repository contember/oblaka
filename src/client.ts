export class CloudflareClient {
	private baseUrl: string

	constructor(
		private readonly config: {
			accountId: string
			getToken: () => Promise<string>
			/** Returns a replacement for a token the API rejected with 401; the request is then retried once. */
			refreshToken?: (rejected: string) => Promise<string>
		},
	) {
		this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}`
	}

	public async fetch<T>({ url, method, body, headers }: {
		method: 'GET' | 'POST' | 'PUT' | 'DELETE'
		url: string
		body?: any
		headers?: Record<string, string>
	}): Promise<T> {
		const send = (token: string) =>
			fetch(`${this.baseUrl}${url}`, {
				method,
				headers: {
					Authorization: `Bearer ${token}`,
					...(body ? { 'Content-Type': 'application/json' } : {}),
					...headers,
				},
				body: JSON.stringify(body),
			})

		const token = await this.config.getToken()
		let response = await send(token)
		let refreshed = false
		if (response.status === 401 && this.config.refreshToken) {
			await response.body?.cancel()
			response = await send(await this.config.refreshToken(token))
			refreshed = true
		}

		if (!response.ok) {
			const hint = refreshed && response.status === 401 ? '\nThe refreshed token was rejected too; run `wrangler login` to re-authenticate.' : ''
			throw new Error(`Failed to fetch ${url}: ${response.statusText} ${await response.text()}${hint}`)
		}

		const res: any = await response.json()
		if (!res.success) {
			console.error('Cloudflare API error:', res)
			throw new Error(`Failed to fetch: ${res.errors?.[0]?.message ?? 'Unknown error'}`)
		}
		return res.result
	}
}
