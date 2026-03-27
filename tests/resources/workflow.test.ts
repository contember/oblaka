import { describe, expect, test } from 'bun:test'
import { Workflow } from '../../src/resources/workflow'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('Workflow', () => {
	describe('getId', () => {
		test('returns workflow resource kind', () => {
			const wf = new Workflow({ name: 'my-wf', className: 'MyWorkflow' })
			expect(wf.getId()).toEqual({ resource: 'workflow', id: 'my-wf' })
		})
	})

	describe('configureBinding', () => {
		test('adds workflow binding', () => {
			const wf = new Workflow({ name: 'my-wf', className: 'MyWorkflow' })
			const config = wf.configureBinding({ config: emptyConfig, binding: 'WF', env: 'local' })

			expect(config.workflows).toEqual([{
				binding: 'WF',
				class_name: 'MyWorkflow',
				name: 'my-wf',
			}])
		})

		test('uses state name when available', () => {
			const wf = new Workflow({ name: 'my-wf', className: 'MyWorkflow' })
			const config = wf.configureBinding({
				config: emptyConfig,
				binding: 'WF',
				state: { name: 'prod-my-wf' },
				env: 'production',
			})

			expect(config.workflows![0].name).toBe('prod-my-wf')
		})

		test('appends to existing workflows', () => {
			const wf = new Workflow({ name: 'second-wf', className: 'SecondWorkflow' })
			const existing = {
				workflows: [{ binding: 'WF1', class_name: 'FirstWorkflow', name: 'first-wf' }],
			} as Config
			const config = wf.configureBinding({ config: existing, binding: 'WF2', env: 'local' })

			expect(config.workflows).toHaveLength(2)
		})
	})
})
