export class CloudflareClient {
	private baseUrl: string

	constructor(
		private readonly config: {
			accountId: string
			apiToken: string
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
		if (!this.config.apiToken) {
			throw new Error('API token is not set')
		}
		const response = await fetch(`${this.baseUrl}${url}`, {
			method,
			headers: {
				Authorization: `Bearer ${this.config.apiToken}`,
				...(body ? { 'Content-Type': 'application/json' } : {}),
				...headers,
			},
			body: JSON.stringify(body),
		})

		if (!response.ok) {
			throw new Error(`Failed to fetch ${url}: ${response.statusText} ${await response.text()}`)
		}

		const res: any = await response.json()
		if (!res.success) {
			console.error('Cloudflare API error:', res)
			throw new Error(`Failed to fetch: ${res.errors?.[0]?.message ?? 'Unknown error'}`)
		}
		return res.result
	}
}
