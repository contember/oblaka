import { describe, expect, test } from 'bun:test'
import { getNextMigrationTag } from '../../src/utils/migrations'

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
