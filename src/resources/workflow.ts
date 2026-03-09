import type { BindableResource, Config, Context, ResourceDestroyer } from '../types'

export interface WorkflowState {
	name: string
}

export class Workflow implements BindableResource<WorkflowState> {
	constructor(
		public readonly options: {
			name: string
			className: string
		},
	) {}

	getId() {
		return {
			resource: 'workflow' as const,
			id: this.options.name,
		}
	}

	configureBinding(args: { config: Config; binding: string; state?: WorkflowState; env: string }): Config {
		return {
			...args.config,
			workflows: [
				...args.config?.workflows ?? [],
				{
					binding: args.binding,
					class_name: this.options.className,
					name: args.state?.name ?? this.options.name,
				},
			],
		}
	}

	async apply({ state, context }: { state?: WorkflowState; context: Context }): Promise<WorkflowState> {
		return state ?? {
			name: `${context.env}-${this.options.name}`,
		}
	}
}

export const WorkflowDestroyer: ResourceDestroyer<WorkflowState> = async (args) => {
	// nothing to do
}
