import type { BindableResource, Config, Context, ResourceDestroyer } from '../types'

export interface KVNamespaceState {
	name: string
	id: string
}

export class KVNamespace implements BindableResource<KVNamespaceState> {
	constructor(
		public readonly options: {
			name: string
		},
	) {}

	getId() {
		return {
			resource: 'kv_namespace' as const,
			id: this.options.name,
		}
	}

	configureBinding(args: { config: Config; binding: string; state?: KVNamespaceState; env: string }): Config {
		return {
			...args.config,
			kv_namespaces: [
				...args.config?.kv_namespaces ?? [],
				{
					binding: args.binding,
					id: args.state?.id || this.options.name,
				},
			],
		}
	}

	async apply(args: { state?: KVNamespaceState; context: Context; dryRun: boolean }): Promise<KVNamespaceState> {
		if (args.state) {
			return args.state
		}
		const remoteName = `${args.context.env}-${this.options.name}`
		if (args.dryRun) {
			return {
				name: remoteName,
				id: 'dry-run-id-' + Math.random().toString(36).substring(2, 9),
			}
		}

		const result = await args.context.client.fetch<{ id: string }>({
			url: `/storage/kv/namespaces`,
			method: 'POST',
			body: {
				title: remoteName,
			},
		})
		return {
			name: remoteName,
			id: result.id,
		}
	}
}

export const KVNamespaceDestroyer: ResourceDestroyer<KVNamespaceState> = async (args): Promise<void> => {
	await args.context.client.fetch({
		url: `/storage/kv/namespaces/${args.state.id}`,
		method: 'DELETE',
	})
}
