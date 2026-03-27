import { describe, expect, test } from 'bun:test'
import { parseArgs } from '../../src/commands/utils/args'

describe('parseArgs', () => {
	test('parses positional arguments', () => {
		const result = parseArgs(['file.ts', 'another.ts'])
		expect(result.positional).toEqual(['file.ts', 'another.ts'])
		expect(result.named).toEqual({})
	})

	test('parses named arguments with values', () => {
		const result = parseArgs(['--env', 'production', '--account-id', '123'])
		expect(result.named).toEqual({ env: 'production', 'account-id': '123' })
		expect(result.positional).toEqual([])
	})

	test('parses boolean flags', () => {
		const result = parseArgs(['--remote', '--dry-run'])
		expect(result.named).toEqual({ remote: true, 'dry-run': true })
	})

	test('parses mixed positional, named, and boolean arguments', () => {
		const result = parseArgs(['oblaka.ts', '--env', 'staging', '--remote', '--account-id', 'abc'])
		expect(result.positional).toEqual(['oblaka.ts'])
		expect(result.named).toEqual({ env: 'staging', remote: true, 'account-id': 'abc' })
	})

	test('treats flag before another flag as boolean', () => {
		const result = parseArgs(['--remote', '--env', 'local'])
		expect(result.named.remote).toBe(true)
		expect(result.named.env).toBe('local')
	})

	test('handles empty args', () => {
		const result = parseArgs([])
		expect(result.positional).toEqual([])
		expect(result.named).toEqual({})
	})
})
