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
				Omit<
					Config,
					| 'name'
					| 'compatibility_flags'
					| 'account_id'
					| 'kv_namespaces'
					| 'r2_buckets'
					| 'd1_databases'
					| 'queues'
					| 'durable_objects'
					| 'migrations'
					| 'workflows'
					| 'containers'
					| 'send_email'
					| 'services'
					| 'vectorize'
					| 'analytics_engine_datasets'
					| 'browser'
					| 'images'
					| 'version_metadata'
					| 'worker_loaders'
					| 'vpc_networks'
					| 'ai_search_namespaces'
					| 'flagship'
					| 'cache'
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

		// Adopt an existing worker instead of failing on create. State can be
		// lost (e.g. the shared cf-state KV namespace gets clobbered by another
		// project deploying the same env), in which case a blind create returns
		// 10040 "already exists". Look it up by name and adopt it.
		const existingWorkers = await args.context.client.fetch<{ id: string; name: string }[]>({
			method: 'GET',
			url: `/workers/workers`,
		})
		const existingWorker = existingWorkers.find(w => w.name === remoteName)
		if (existingWorker) {
			return { id: existingWorker.id, name: remoteName }
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
