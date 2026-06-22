import * as path from 'node:path'
import type { Worker } from '../resources'
import type { DefineFn } from '../types'

export const loadDefinition = async ({ main, env }: {
	main: string
	env: string
}): Promise<Worker | undefined> => {
	const defineFn = (await import(path.resolve(main))).default as DefineFn
	return defineFn({ env })
}
