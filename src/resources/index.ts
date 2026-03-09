import type { Destroyers, ResourceDestroyer, ResourceKind } from '../types'
import { ContainerDestroyer } from './container'
import { D1Destroyer as D1DatabaseDestroyer } from './d1'
import { DurableObjectDestroyer } from './do'
import { KVNamespaceDestroyer } from './kv'
import { QueueDestroyer } from './queues'
import { R2BucketDestroyer } from './r2'
import { WorkerDestroyer } from './worker'
import { WorkflowDestroyer } from './workflow'

export * from './analytics-engine'
export * from './browser'
export * from './container'
export * from './d1'
export * from './do'
export * from './images'
export * from './kv'
export * from './queues'
export * from './r2'
export * from './service-reference'
export * from './version-metadata'
export * from './worker'
export * from './workflow'

export const destroyers: Destroyers = {
	analytics_engine: async () => {}, // Analytics Engine datasets are managed automatically by Cloudflare
	container: ContainerDestroyer,
	d1_database: D1DatabaseDestroyer,
	durable_object: DurableObjectDestroyer,
	kv_namespace: KVNamespaceDestroyer,
	queue: QueueDestroyer,
	r2_bucket: R2BucketDestroyer,
	workflow: WorkflowDestroyer,
	worker: WorkerDestroyer,
} satisfies Record<ResourceKind, ResourceDestroyer<any>>
