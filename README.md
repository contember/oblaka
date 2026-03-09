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

			// Sub-worker — gets its own wrangler.jsonc
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

| Resource           | Description                     |
| ------------------ | ------------------------------- |
| `Worker`           | Cloudflare Worker with bindings |
| `D1Database`       | D1 SQL database                 |
| `KVNamespace`      | KV key-value storage            |
| `R2Bucket`         | R2 object storage               |
| `Queue`            | Queue (producer/consumer)       |
| `DurableObject`    | Durable Object                  |
| `Workflow`         | Cloudflare Workflow             |
| `Container`        | Container                       |
| `AnalyticsEngine`  | Analytics Engine dataset        |
| `Browser`          | Browser Rendering API binding   |
| `Images`           | Image Optimization binding      |
| `ServiceReference` | Reference to another worker     |
| `VersionMetadata`  | Version metadata binding        |

## CLI options

| Option              | Env variable            | Default          | Description                      |
| ------------------- | ----------------------- | ---------------- | -------------------------------- |
| `--env`             | `CLOUDFLARE_ENV`        | `local`          | Environment name                 |
| `--remote`          |                         | `false`          | Deploy resources to Cloudflare   |
| `--dry-run`         |                         | `false`          | Preview changes without applying |
| `--account-id`      | `CLOUDFLARE_ACCOUNT_ID` |                  | Cloudflare account ID            |
| `--api-token`       | `CLOUDFLARE_API_TOKEN`  |                  | Cloudflare API token             |
| `--config`          |                         | `wrangler.jsonc` | Output config filename           |
| `--state-namespace` |                         | `cf-state`       | KV namespace for state storage   |
| `--destroy`         |                         | `false`          | Destroy managed resources        |
| `--out-state`       |                         |                  | Export state to a JSON file      |

## State management

When deploying with `--remote`, Oblaka creates resources (D1 databases, KV namespaces, R2 buckets, etc.) via the Cloudflare API and needs to track their IDs for subsequent runs. This state is stored in a dedicated KV namespace on your Cloudflare account (default: `cf-state`, configurable with `--state-namespace`).

## License

MIT
