import type { CloudflareClient } from './client'

export interface State {
	version: number
	resources: Record<string, any>
}

export interface StateKey {
	env: string
}

export interface StateStorage {
	get(key: StateKey): Promise<State | null>
	set(key: StateKey, state: State): Promise<void>
}

export class KVStateStorage implements StateStorage {
	private id: string | undefined = undefined

	constructor(
		private readonly cfClient: CloudflareClient,
		private readonly namespace: string,
	) {
	}

	private async resolveKvId(): Promise<string> {
		if (this.id) {
			return this.id
		}
		const id = await this.cfClient.fetch<{ title: string; id: string }[]>({
			url: `/storage/kv/namespaces`,
			method: 'GET',
		})
		const existing = id.find(i => i.title === this.namespace)
		if (existing) {
			this.id = existing.id
			return existing.id
		}
		const createResult = await this.cfClient.fetch<{ id: string }>({
			url: `/storage/kv/namespaces`,
			method: 'POST',
			body: { title: this.namespace },
		})
		this.id = createResult.id
		return createResult.id
	}

	async get(key: StateKey): Promise<State> {
		const value = await this.cfClient.fetch<{ values: Record<string, string> }>({
			url: `/storage/kv/namespaces/${await this.resolveKvId()}/bulk/get`,
			method: 'POST',
			body: {
				keys: [key.env],
			},
		})
		return value.values?.[key.env] ? JSON.parse(value.values[key.env]) : { version: 1, resources: {} }
	}

	async set(key: StateKey, state: State): Promise<void> {
		await this.cfClient.fetch({
			url: `/storage/kv/namespaces/${await this.resolveKvId()}/values/${key.env}`,
			method: 'PUT',
			body: state,
		})
	}
}
