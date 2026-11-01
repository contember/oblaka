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

export interface DurableObjectMigration {
	tag: string
	new_classes?: string[]
	new_sqlite_classes?: string[]
	renamed_classes?: { from: string; to: string }[]
	deleted_classes?: string[]
	transferred_classes?: { from: string; from_script: string; to: string }[]
}

/**
 * Replays the migration history in tag order and returns the Durable Object classes
 * that exist after the last migration.
 */
export const getLiveDurableObjectClasses = (migrations: DurableObjectMigration[] | undefined): Set<string> => {
	const live = new Set<string>()
	// Same ordering as getNextMigrationTag.
	const ordered = [...(migrations ?? [])].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
	for (const migration of ordered) {
		for (const className of [...(migration.new_classes ?? []), ...(migration.new_sqlite_classes ?? [])]) {
			live.add(className)
		}
		for (const { from, to } of migration.renamed_classes ?? []) {
			live.delete(from)
			live.add(to)
		}
		for (const { to } of migration.transferred_classes ?? []) {
			live.add(to)
		}
		for (const className of migration.deleted_classes ?? []) {
			live.delete(className)
		}
	}
	return live
}

/**
 * Returns the migrations with one appended that creates `className`, or renames
 * `renamedFrom` to it when that class still exists. Returns them unchanged when
 * `className` already exists.
 */
export const withDurableObjectClass = <TMigration extends { tag: string }>(
	config: { migrations?: TMigration[] },
	className: string,
	renamedFrom?: string,
): (TMigration | DurableObjectMigration)[] => {
	const migrations = config.migrations ?? []
	const live = getLiveDurableObjectClasses(migrations as DurableObjectMigration[])
	if (live.has(className)) {
		return migrations
	}
	const tag = getNextMigrationTag(config)
	if (renamedFrom && live.has(renamedFrom)) {
		return [...migrations, { tag, renamed_classes: [{ from: renamedFrom, to: className }] }]
	}
	return [...migrations, { tag, new_sqlite_classes: [className] }]
}
