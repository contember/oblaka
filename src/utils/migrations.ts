export const getNextMigrationTag = (config: { migrations?: { tag: string }[] }) => {
	const latestTag = config.migrations?.map(it => it.tag).sort().pop() ?? 'v0000'

	const match = latestTag.match(/^v(\d{4})$/)
	if (!match) {
		throw new Error(`Invalid migration tag format: ${latestTag}`)
	}

	const currentVersion = parseInt(match[1], 10)
	const nextVersion = currentVersion + 1
	return `v${String(nextVersion).padStart(4, '0')}`
}
