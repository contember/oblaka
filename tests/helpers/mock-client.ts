import type { Context } from '../../src/types'

/**
 * Builds a Context whose client.fetch is backed by a lookup table keyed by
 * `"<METHOD> <url>"`. Exact matches win; otherwise the first key that is a
 * prefix of the request matches. Every call is recorded in `calls` so tests can
 * assert that, e.g., adopt-on-conflict skipped the create POST.
 */
export function mockContext(handlers: Record<string, unknown>, env = 'production') {
	const calls: { method: string; url: string }[] = []
	const client = {
		async fetch({ method, url }: { method: string; url: string }) {
			calls.push({ method, url })
			const signature = `${method} ${url}`
			if (signature in handlers) {
				return handlers[signature]
			}
			const prefix = Object.keys(handlers).find(key => signature.startsWith(key))
			if (prefix !== undefined) {
				return handlers[prefix]
			}
			throw new Error(`unexpected request: ${signature}`)
		},
	}
	return { context: { env, client: client as unknown as Context['client'] } satisfies Context, calls }
}
