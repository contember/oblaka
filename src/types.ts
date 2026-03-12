import type { Unstable_RawEnvironment } from 'wrangler'
import type { CloudflareClient } from './client'
import type { Worker } from './resources'

export type Region = 'wnam' | 'enam' | 'weur' | 'eeur' | 'apac' | 'oc'

export type CompatibilityFlags = 'nodejs_compat' | (string & {})
export type AnyBindable = BindableResource<any> | Bindable

export interface Context {
	env: string
	client: CloudflareClient
}

export type Config = Unstable_RawEnvironment

export type ResourceKind =
	| 'worker'
	| 'durable_object'
	| 'd1_database'
	| 'kv_namespace'
	| 'r2_bucket'
	| 'queue'
	| 'container'
	| 'workflow'
	| 'analytics_engine'

export interface Resource<TState> {
	getId(): { resource: ResourceKind; id: string }
	apply(args: { state?: TState; context: Context; dryRun: boolean }): Promise<TState>
}

export type ResourceDestroyer<TState> = (args: { state: TState; context: Context }) => Promise<void>

export type Destroyers = Record<string, ResourceDestroyer<any>>

export interface BindableResource<TState> extends Resource<TState> {
	configureBinding(args: { config: Config; binding: string; state?: TState; env: string }): Config
}

export interface Bindable {
	configureBinding(args: { config: Config; binding: string; env: string }): Config
}

export type DefineFn = (config: { env: string }) => Worker | undefined
