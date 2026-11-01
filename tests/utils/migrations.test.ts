import { describe, expect, test } from 'bun:test'
import { getLiveDurableObjectClasses, getNextMigrationTag, withDurableObjectClass } from '../../src/utils/migrations'

describe('getNextMigrationTag', () => {
	test('returns v0001 when no migrations exist', () => {
		expect(getNextMigrationTag({})).toBe('v0001')
	})

	test('returns v0001 when migrations array is empty', () => {
		expect(getNextMigrationTag({ migrations: [] })).toBe('v0001')
	})

	test('increments from latest tag', () => {
		expect(getNextMigrationTag({ migrations: [{ tag: 'v0003' }] })).toBe('v0004')
	})

	test('picks the highest tag when multiple exist', () => {
		expect(getNextMigrationTag({
			migrations: [{ tag: 'v0001' }, { tag: 'v0005' }, { tag: 'v0003' }],
		})).toBe('v0006')
	})

	test('pads version number to 4 digits', () => {
		expect(getNextMigrationTag({ migrations: [{ tag: 'v0009' }] })).toBe('v0010')
	})

	test('throws on invalid tag format', () => {
		expect(() => getNextMigrationTag({ migrations: [{ tag: 'invalid' }] })).toThrow('Invalid migration tag format')
	})
})

describe('getLiveDurableObjectClasses', () => {
	test('replays created, renamed, transferred and deleted classes in tag order', () => {
		const live = getLiveDurableObjectClasses([
			{ tag: 'v0003', deleted_classes: ['B'] },
			{ tag: 'v0001', new_sqlite_classes: ['A', 'B'], new_classes: ['Legacy'] },
			{ tag: 'v0002', renamed_classes: [{ from: 'A', to: 'C' }] },
			{ tag: 'v0004', transferred_classes: [{ from: 'X', from_script: 'other', to: 'D' }] },
		])
		expect([...live].sort()).toEqual(['C', 'D', 'Legacy'])
	})

	test('returns an empty set without migrations', () => {
		expect(getLiveDurableObjectClasses(undefined).size).toBe(0)
	})
})

describe('withDurableObjectClass', () => {
	test('creates a class that does not exist', () => {
		expect(withDurableObjectClass({}, 'A')).toEqual([{ tag: 'v0001', new_sqlite_classes: ['A'] }])
	})

	test('leaves the history alone when the class exists', () => {
		const migrations = [{ tag: 'v0001', new_sqlite_classes: ['A'] }]
		expect(withDurableObjectClass({ migrations }, 'A')).toBe(migrations)
	})

	test('renames from the previous class when it exists', () => {
		expect(withDurableObjectClass({ migrations: [{ tag: 'v0001', new_sqlite_classes: ['A'] }] }, 'B', 'A').at(-1))
			.toEqual({ tag: 'v0002', renamed_classes: [{ from: 'A', to: 'B' }] })
	})

	test('creates the class when the previous one does not exist', () => {
		expect(withDurableObjectClass({}, 'B', 'A')).toEqual([{ tag: 'v0001', new_sqlite_classes: ['B'] }])
	})

	test('creates a class again after it was deleted', () => {
		const migrations = [{ tag: 'v0001', new_sqlite_classes: ['A'] }, { tag: 'v0002', deleted_classes: ['A'] }]
		expect(withDurableObjectClass({ migrations }, 'A').at(-1)).toEqual({ tag: 'v0003', new_sqlite_classes: ['A'] })
	})
})
