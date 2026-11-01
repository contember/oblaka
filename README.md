# Oblaka

Infrastructure as Code for Cloudflare. Define Workers, databases, storage, queues, and other Cloudflare resources in TypeScript.

## Install

```bash
bun add -d oblaka-iac
```

## Quick start

Create an infrastructure definition file (e.g. `oblaka.ts`):

```typescript
import {
	D1Database,
	define,
	DurableObject,
	KVNamespace,
	Queue,
	R2Bucket,
	ServiceReference,
	Worker,
} from 'oblaka-iac'

export default define(({ env }) => {
	const uploadsR2 = new R2Bucket({ name: 'uploads', locationHint: 'weur' })

	return new Worker({
		dir: '.',
		name: 'my-app',
		main: './src/index.ts',
		compatibility_flags: ['nodejs_compat'],
		compatibility_date: '2025-12-02',
		observability: { enabled: true },
		bindings: {
			DB: new D1Database({ name: 'main', migrationsDir: 'migrations' }),
			Cache: new KVNamespace({ name: 'cache' }),
			Uploads: uploadsR2,
			EmailQueue: new Queue({ name: 'email-queue', binding: 'both' }),
			Room: new DurableObject({ name: 'Room', className: 'Room' }),

			// Sub-worker: gets its own wrangler.jsonc
			Admin: new Worker({
				dir: './packages/admin',
				name: 'my-app-admin',
				main: './src/index.ts',
				compatibility_flags: ['nodejs_compat'],
				compatibility_date: '2025-12-02',
				bindings: {
					Uploads: uploadsR2, // shared R2 bucket
					API: new ServiceReference('my-app'),
				},
			}),
		},
		vars: {
			NODE_ENV: env === 'local' ? 'development' : 'production',
			ENVIRONMENT: env,
		},
	})
})
```

### Generate local config

Generates a `wrangler.jsonc` config inside each worker directory:

```bash
bunx oblaka oblaka.ts
```

To generate a second config next to the default one (for example for a test environment), pass `--config` with a file name. Unlike wrangler's `--config`, it is a bare file name ending in `.json` or `.jsonc`, not a path: the file is written into each worker's `dir`.

```bash
bunx oblaka oblaka.ts --env test --config wrangler.test.jsonc
```

Durable Object migration history is read back from the generated file itself, so each config file name keeps its own history. Renaming the config of an already deployed worker starts the migrations from `v0001` again; rename the existing file first instead.

### Deploy to Cloudflare

Creates resources on Cloudflare and generates the config:

```bash
bunx oblaka oblaka.ts \
	--remote \
	--env production \
	--account-id $CLOUDFLARE_ACCOUNT_ID \
	--api-token $CLOUDFLARE_API_TOKEN
```

## Resources

Resources marked as provisioned are created through the Cloudflare API with `--remote` and tracked in the state. Workflows and containers get a per-environment name in the state and are created by `wrangler deploy`. Analytics Engine datasets are created by Cloudflare on the first write. The rest only add a binding to the generated config.

| Resource           | Description                                         | Provisioned |
| ------------------ | --------------------------------------------------- | ----------- |
| `Worker`           | Cloudflare Worker with bindings                     | yes         |
| `D1Database`       | D1 SQL database, optional `migrationsDir`           | yes         |
| `KVNamespace`      | KV key-value storage                                | yes         |
| `R2Bucket`         | R2 object storage                                   | yes         |
| `Queue`            | Queue (producer, consumer or both)                  | yes         |
| `DurableObject`    | Durable Object class, see [below](#durable-objects) |             |
| `Workflow`         | Cloudflare Workflow                                 |             |
| `Container`        | Container attached to a Durable Object class        |             |
| `AnalyticsEngine`  | Analytics Engine dataset                            |             |
| `VectorizeIndex`   | Vectorize index                                     | yes         |
| `AiGateway`        | Workers AI binding (`ai`)                           |             |
| `AiSearch`         | AI Search namespace                                 |             |
| `Browser`          | Browser Rendering API binding                       |             |
| `Images`           | Image Optimization binding                          |             |
| `EmailService`     | Send Email binding                                  |             |
| `Flagship`         | Flagship feature flags                              |             |
| `VpcNetwork`       | VPC network or Cloudflare Tunnel (`mesh`, `tunnel`) |             |
| `WorkerLoader`     | Worker Loader for dynamic workers                   |             |
| `ServiceReference` | Reference to another worker by name                 |             |
| `VersionMetadata`  | Version metadata binding                            |             |

## Conditional bindings

A binding set to `false`, `null` or `undefined` is skipped, so it can depend on the environment:

```typescript
bindings: {
	Cache: new KVNamespace({ name: 'cache' }),
	Analytics: env === 'production' && new AnalyticsEngine({ name: 'events' }),
},
```

Don't make `DurableObject` or `Container` bindings conditional. All environments share one migration history in the generated file, so a run for an environment without the class would see it as removed (see [Durable Objects](#durable-objects)).

## Durable Objects

Oblaka writes the Durable Object migrations (`new_sqlite_classes`, `renamed_classes`, `deleted_classes`) into the generated config and reads the history back from it on the next run, so the generated file has to be kept between runs.

Deleting a class deletes all its stored data, so oblaka never does it just because a binding disappeared. When a class that was bound in the previous generated config is no longer bound, the run fails before anything is created or written, until you say what should happen:

```typescript
new Worker({
	// ...
	bindings: {
		// Renamed from Room: the data moves to ChatRoom.
		ChatRoom: new DurableObject({
			name: 'chat-room',
			className: 'ChatRoom',
			renamedFrom: 'Room',
		}),
	},
	// Deleted together with all their data.
	deletedDurableObjects: ['OldCounter'],
})
```

`renamedFrom` and `deletedDurableObjects` can stay in the definition after the change is deployed; once the migration is in the history they do nothing. Remove a `deletedDurableObjects` entry before binding a new class with the same name. `deleteDurableObjectsOnRemoval: true` deletes every removed class without listing it, and `false` keeps removed classes alive (for example a class used only through `ctx.exports`).

## Types for `env`

Generate the `Env` type from the generated config with Wrangler:

```bash
bunx oblaka oblaka.ts && bunx wrangler types
```

`wrangler types` reads `wrangler.jsonc` in the worker directory and writes `worker-configuration.d.ts`, including Durable Object namespaces typed by their class from `main`. Run it in each worker directory, and pass `-c` when the config has a different name.

## CLI options

| Option              | Env variable            | Default          | Description                          |
| ------------------- | ----------------------- | ---------------- | ------------------------------------ |
| `--env`             | `CLOUDFLARE_ENV`        | `local`          | Environment name                     |
| `--remote`          |                         | `false`          | Deploy resources to Cloudflare       |
| `--dry-run`         |                         | `false`          | Preview changes without applying     |
| `--account-id`      | `CLOUDFLARE_ACCOUNT_ID` |                  | Cloudflare account ID                |
| `--api-token`       | `CLOUDFLARE_API_TOKEN`  |                  | Cloudflare API token                 |
| `--config`          |                         | `wrangler.jsonc` | Output config file name (not a path) |
| `--state-namespace` |                         | `cf-state`       | KV namespace for state storage       |
| `--destroy`         |                         | `false`          | Destroy managed resources            |
| `--out-state`       |                         |                  | Export state to a JSON file          |

## State management

When deploying with `--remote`, Oblaka creates resources (D1 databases, KV namespaces, R2 buckets, etc.) via the Cloudflare API and needs to track their IDs for subsequent runs. This state is stored in a dedicated KV namespace on your Cloudflare account (default: `cf-state`, configurable with `--state-namespace`).

## License

MIT
