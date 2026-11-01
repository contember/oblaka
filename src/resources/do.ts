import type { BindableResource, Config, ResourceDestroyer } from '../types'
import { withDurableObjectClass } from '../utils/migrations'

export interface DurableObjectState {
	name: string
}

export class DurableObject implements BindableResource<DurableObjectState> {
	constructor(
		public readonly options: {
			name: string
			className: string
			/**
			 * Previous class name when the class was renamed. Generates a `renamed_classes`
			 * migration, so the stored data moves to the new class instead of being deleted.
			 * Safe to keep after the rename is deployed.
			 */
			renamedFrom?: string
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
		return {
			...args.config,
			migrations: withDurableObjectClass(args.config, this.options.className, this.options.renamedFrom),
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
