import type { BindableResource, Config, Context, ResourceDestroyer } from '../types'
import { getNextMigrationTag } from '../utils/migrations'

export interface ContainerState {
	name: string
}

export class Container implements BindableResource<ContainerState> {
	constructor(
		public readonly options: {
			name: string
			className: string
			image: string
			/**
			 * Docker build context for the image, RELATIVE to the wrangler config directory (emitted as
			 * `image_build_context`). When unset, wrangler defaults the context to the Dockerfile's own
			 * directory. Set it (e.g. `'../..'`) when the Dockerfile must COPY files from OUTSIDE its
			 * directory — e.g. a Dockerfile in `packages/runner` that copies sibling packages from a monorepo root.
			 */
			imageBuildContext?: string
			maxInstances: number
			instanceType: 'dev' | 'basic' | 'standard'
			/**
			 * The minimum number of seconds to wait before an active container instance becomes eligible for updating during a rollout. At that point, the container will be sent at SIGTERM and still has 15 minutes to shut down before it is forcibly killed and updated. Default is 0.
			 */
			rolloutActiveGracePeriod?: number
			/**
			 * Build-time variables, equivalent to using --build-arg with docker build. If you want to provide environment variables to your container at runtime, you should use secret bindings or envVars on the Container class.
			 */
			imageVars?: Record<string, string>
		},
	) {}

	getId() {
		return {
			resource: 'container' as const,
			id: this.options.name,
		}
	}

	async apply({ context, state }: { context: Context; state?: ContainerState }): Promise<ContainerState> {
		return (
			state ?? {
				name: `${context.env}-${this.options.name}`,
			}
		)
	}

	configureBinding(args: { config: Config; binding: string; state?: ContainerState; env: string }): Config {
		const hasMigration = args.config?.migrations?.find((it: { new_sqlite_classes?: string[] }) =>
			it.new_sqlite_classes?.includes(this.options.className)
		)

		return {
			...args.config,
			migrations: [
				...(args.config.migrations ?? []),
				...(hasMigration
					? []
					: [
						{
							tag: getNextMigrationTag(args.config),
							new_sqlite_classes: [this.options.className],
						},
					]),
			],
			containers: [
				...(args.config.containers ?? []),
				{
					class_name: this.options.className,
					name: args.state?.name ?? this.options.name,
					image: this.options.image,
					image_build_context: this.options.imageBuildContext,
					instance_type: this.options.instanceType,
					max_instances: this.options.maxInstances,
					rollout_active_grace_period: this.options.rolloutActiveGracePeriod,
					image_vars: this.options.imageVars,
				},
			],
			durable_objects: {
				...(args.config.durable_objects ?? {}),
				bindings: [
					...(args.config.durable_objects?.bindings ?? []),
					{
						name: args.binding,
						class_name: this.options.className,
					},
				],
			},
		}
	}
}

export const ContainerDestroyer: ResourceDestroyer<ContainerState> = async (args): Promise<void> => {
	// nothing to do
}
