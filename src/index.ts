import type { DefineFn } from './types'

export * from './resources'

export const define = (cb: DefineFn) => {
	return cb
}
