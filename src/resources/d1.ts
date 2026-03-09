import type { BindableResource, Config, Context, ResourceDestroyer } from '../types'

export interface D1DatabaseState {
	id: string
	name: string
}

export class D1Database implements BindableResource<D1DatabaseState> {
	constructor(
		public readonly options: {
			name: string
			migrationsDir?: string
			locationHint?: string
		},
	) {}

	configureBinding(args: { config: Config; binding: string; state?: D1DatabaseState; env: string }): Config {
		return {
			...args.config,
			d1_databases: [
				...args.config?.d1_databases ?? [],
				{
					binding: args.binding,
					database_name: args.state?.name || this.options.name,
					database_id: args.state?.id || this.options.name,
					migrations_dir: this.options.migrationsDir,
				},
			],
		}
	}

	getId() {
		return {
			resource: 'd1_database' as const,
			id: this.options.name,
		}
	}

	async apply(args: { state?: D1DatabaseState; context: Context; dryRun: boolean }): Promise<D1DatabaseState> {
		if (args.state) {
			return args.state
		}
		const remoteName = `${args.context.env}-${this.options.name}`
		if (args.dryRun) {
			return {
				name: remoteName,
				id: 'dry-run-id-' + Math.random().toString(36).substring(2, 11),
			}
		}

		const result = await args.context.client.fetch<{ uuid: string }>({
			url: `/d1/database`,
			method: 'POST',
			body: {
				name: remoteName,
				primary_location_hint: this.options.locationHint,
			},
		})
		return {
			name: remoteName,
			id: result.uuid,
		}
	}
}

export const D1Destroyer: ResourceDestroyer<D1DatabaseState> = async (args): Promise<void> => {
	await args.context.client.fetch({
		url: `/d1/database/${args.state.id}`,
		method: 'DELETE',
	})
}
