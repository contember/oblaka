import * as fs from 'node:fs/promises'

export const tryReadFile = async (path: string) => {
	try {
		return await fs.readFile(path, 'utf-8')
	} catch (error: any) {
		if (error.code === 'ENOENT') {
			return undefined
		}
		throw error
	}
}
