import type { BindableResource, Config, ResourceDestroyer } from '../types'
import { getNextMigrationTag } from '../utils/migrations'

export interface DurableObjectState {
	name: string
}

export class DurableObject implements BindableResource<DurableObjectState> {
	constructor(
		public readonly options: {
			name: string
			className: string
		},
	) {}

	getId() {
		return { resource: 'durable_object' as const, id: this.options.name }
	}

	async apply({ state }: { state?: DurableObjectState }): Promise<DurableObjectState> {
		return state ?? {
			name: this.options.name,
		}
	}

	configureBinding(args: { config: Config; state?: DurableObjectState; binding: string; env: string }): Config {
		const hasMigration = args.config?.migrations?.find((it: { new_sqlite_classes?: string[] }) =>
			it.new_sqlite_classes?.includes(this.options.className)
		)

		return {
			...args.config,
			migrations: [
				...(args.config.migrations ?? []),
				...(hasMigration ? [] : [{
					tag: getNextMigrationTag(args.config),
					new_sqlite_classes: [this.options.className],
				}]),
			],
			durable_objects: {
				...(args.config?.durable_objects ?? {}),
				bindings: [
					...(args.config?.durable_objects?.bindings ?? []),
					{
						name: args.binding,
						class_name: this.options.className,
					},
				],
			},
		}
	}
}

export const DurableObjectDestroyer: ResourceDestroyer<DurableObjectState> = async (args): Promise<void> => {
	// nothing to do
}
