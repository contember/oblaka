import { Container, DurableObject, type Worker } from '../resources'
import type { Config } from '../types'
import { type DurableObjectMigration, getLiveDurableObjectClasses, getNextMigrationTag, withDurableObjectClass } from '../utils/migrations'

export const getBoundDurableObjectClasses = (config: Config): Set<string> =>
	new Set((config.durable_objects?.bindings ?? []).map((b: { class_name: string }) => b.class_name))

/**
 * Checks the worker's Durable Object changes against its existing generated config, so a
 * mistake fails the run before any resource is created or any config is written.
 */
export const validateDurableObjects = (worker: Worker, existingConfig: Config): void => {
	const workerName = worker.options.name
	const deletedDurableObjects = worker.options.deletedDurableObjects ?? []
	const classes = Object.values(worker.options.bindings ?? {}).flatMap(binding => {
		if (binding instanceof DurableObject) {
			return [{ className: binding.options.className, renamedFrom: binding.options.renamedFrom }]
		}
		if (binding instanceof Container) {
			return [{ className: binding.options.className, renamedFrom: undefined }]
		}
		return []
	})
	const bound = new Set(classes.map(c => c.className))

	const renameTargets = new Map<string, string>()
	for (const { className, renamedFrom } of classes) {
		if (!renamedFrom) {
			continue
		}
		if (bound.has(renamedFrom)) {
			throw new Error(
				`Worker '${workerName}': Durable Object class '${className}' is renamed from '${renamedFrom}', which is still bound. `
					+ `Remove the '${renamedFrom}' binding.`,
			)
		}
		const otherTarget = renameTargets.get(renamedFrom)
		if (otherTarget && otherTarget !== className) {
			throw new Error(
				`Worker '${workerName}': Durable Object classes '${otherTarget}' and '${className}' are both renamed from '${renamedFrom}'.`,
			)
		}
		renameTargets.set(renamedFrom, className)
	}

	const deletedAndBound = deletedDurableObjects.filter(c => bound.has(c))
	if (deletedAndBound.length > 0) {
		throw new Error(
			`Worker '${workerName}': Durable Object class ${formatClasses(deletedAndBound)} is listed in deletedDurableObjects but bound. `
				+ 'Remove the binding, or remove the class from deletedDurableObjects.',
		)
	}

	// The same migrations the bindings will produce, so renames are taken into account.
	let migrations = existingConfig.migrations as DurableObjectMigration[] | undefined
	for (const { className, renamedFrom } of classes) {
		migrations = withDurableObjectClass({ migrations }, className, renamedFrom)
	}

	getRemovedDurableObjects({
		workerName,
		migrations,
		previouslyBound: getBoundDurableObjectClasses(existingConfig),
		bound,
		deletedDurableObjects,
		deleteDurableObjectsOnRemoval: worker.options.deleteDurableObjectsOnRemoval,
	})
}

/**
 * Returns the Durable Object classes to delete: live classes that are not bound and either
 * listed in `deletedDurableObjects`, or bound in the previous config with
 * `deleteDurableObjectsOnRemoval: true`. Throws for a class that was bound in the previous
 * config and is no longer, when neither says what to do with it, because deleting a class
 * deletes all its stored data. Live classes that were not bound before are left alone.
 */
export const getRemovedDurableObjects = (args: {
	workerName: string
	migrations: DurableObjectMigration[] | undefined
	previouslyBound: Set<string>
	bound: Set<string>
	deletedDurableObjects: string[]
	deleteDurableObjectsOnRemoval: boolean | undefined
}): string[] => {
	const unbound = [...getLiveDurableObjectClasses(args.migrations)].filter(c => !args.bound.has(c))
	const toDelete = unbound.filter(c =>
		args.deletedDurableObjects.includes(c) || (args.previouslyBound.has(c) && args.deleteDurableObjectsOnRemoval === true)
	)
	const unresolved = unbound.filter(c => args.previouslyBound.has(c) && !toDelete.includes(c))

	if (unresolved.length > 0 && args.deleteDurableObjectsOnRemoval !== false) {
		throw new Error(
			`Worker '${args.workerName}': Durable Object class ${formatClasses(unresolved)} is no longer bound. `
				+ 'Deleting a class deletes all its stored data, so oblaka will not do it implicitly. '
				+ 'Add the class to deletedDurableObjects to delete it, set renamedFrom on the new class if it was renamed, '
				+ 'or set deleteDurableObjectsOnRemoval: false to keep it without a binding.',
		)
	}
	return toDelete
}

/**
 * Appends a `deleted_classes` migration. A class that was created once and never renamed,
 * transferred or deleted before is also dropped from its `new_sqlite_classes` entry; with a
 * longer history the earlier migrations are kept, so they stay consistent with each other.
 */
export const deleteDurableObjectClasses = (config: Config, classes: string[]): Config => {
	if (classes.length === 0) {
		return config
	}
	const migrations = (config.migrations ?? []) as DurableObjectMigration[]
	const stripped = new Set(classes.filter(c => hasSingleCreation(migrations, c)))

	return {
		...config,
		migrations: [
			...(config.migrations ?? []).flatMap(m => {
				if (!m.new_sqlite_classes) return [m]
				const filtered = m.new_sqlite_classes.filter((c: string) => !stripped.has(c))
				if (filtered.length === 0) {
					const { new_sqlite_classes: _, ...rest } = m
					return Object.keys(rest).length > 1 ? [rest as typeof m] : []
				}
				return [{ ...m, new_sqlite_classes: filtered }]
			}),
			{
				tag: getNextMigrationTag(config),
				deleted_classes: classes,
			},
		],
	}
}

const hasSingleCreation = (migrations: DurableObjectMigration[], className: string): boolean => {
	let creations = 0
	for (const m of migrations) {
		creations += (m.new_sqlite_classes ?? []).filter(c => c === className).length
		if (
			m.new_classes?.includes(className)
			|| m.deleted_classes?.includes(className)
			|| m.renamed_classes?.some(r => r.from === className || r.to === className)
			|| m.transferred_classes?.some(t => t.to === className)
		) {
			return false
		}
	}
	return creations === 1
}

const formatClasses = (classes: string[]) => classes.map(c => `'${c}'`).join(', ')
