import type { DefineFn } from './types'

export * from './resources'

export { deploy } from './api'
export type { Definition, DeployOptions, DeployResult } from './api'
export type { GeneratedConfig } from './commands/resource-processor'

export const define = (cb: DefineFn) => {
	return cb
}
