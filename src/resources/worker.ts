import type { AnyBindable, BindableResource, CompatibilityFlags, Config, Context, ResourceDestroyer } from '../types'

export interface WorkerState {
	id: string
	name: string
}
export class Worker implements BindableResource<WorkerState> {
	constructor(
		public readonly options:
			& {
				dir: string
				name: string
				compatibility_flags: CompatibilityFlags[]
				bindings: Record<string, AnyBindable>
				deleteDurableObjectsOnRemoval?: boolean
			}
			& Partial<
				Pick<
					Config,
					| 'main'
					| 'compatibility_date'
					| 'vars'
					| 'find_additional_modules'
					| 'base_dir'
					| 'preview_urls'
					| 'routes'
					| 'route'
					| 'observability'
					| 'logpush'
					| 'rules'
					| 'limits'
					| 'no_bundle'
					| 'keep_names'
					| 'first_party_worker'
					| 'minify'
					| 'assets'
					| 'compliance_region'
					| 'build'
					| 'define'
					| 'jsx_factory'
					| 'jsx_fragment'
					| 'triggers'
					| 'upload_source_maps'
				>
			>,
	) {}

	getId() {
		return {
			resource: 'worker' as const,
			id: this.options.name,
		}
	}

	configureSelf(args: { config: Config; state?: WorkerState | undefined }): Config {
		return {
			...args.config,
			name: args.state?.name ?? this.options.name,
		}
	}

	configureBinding(args: { config: Config; binding: string; state?: WorkerState | undefined; env: string }): Config {
		return {
			...args.config,
			services: [
				...(args.config.services ?? []),
				{
					binding: args.binding,
					service: args.state?.name ?? (args.env === 'local' ? this.options.name : `${args.env}-${this.options.name}`),
				},
			],
		}
	}

	async apply(args: { state?: WorkerState | undefined; context: Context; dryRun: boolean }): Promise<WorkerState> {
		if (args.state) {
			return args.state
		}
		const remoteName = `${args.context.env}-${this.options.name}`

		if (args.dryRun) {
			return {
				id: 'dry-run-id-' + Math.random().toString(36).substring(2, 9),
				name: remoteName,
			}
		}

		const result = await args.context.client.fetch<{ id: string }>({
			method: 'POST',
			url: `/workers/workers`,
			body: {
				name: remoteName,
			},
		})

		await args.context.client.fetch({
			method: 'POST',
			url: `/workers/workers/${result.id}/versions`,
			body: {
				main_module: 'index.js',
				modules: [
					{
						name: 'index.js',
						content_type: 'application/javascript+module',
						content_base64: btoa(`export default {fetch: () => new Response("Hello")}`),
					},
				],
			},
		})
		return {
			id: result.id,
			name: remoteName,
		}
	}
}

export const WorkerDestroyer: ResourceDestroyer<WorkerState> = async ({ state, context }) => {
	await context.client.fetch({
		method: 'DELETE',
		url: `/workers/workers/${state.id}`,
	})
}
