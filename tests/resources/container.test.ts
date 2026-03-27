import { describe, expect, test } from 'bun:test'
import { Container } from '../../src/resources/container'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

const createContainer = (overrides?: Partial<ConstructorParameters<typeof Container>[0]>) =>
	new Container({
		name: 'my-container',
		className: 'MyContainer',
		image: 'docker.io/my-image:latest',
		maxInstances: 3,
		instanceType: 'standard',
		...overrides,
	})

describe('Container', () => {
	describe('getId', () => {
		test('returns container resource kind', () => {
			const container = createContainer()
			expect(container.getId()).toEqual({ resource: 'container', id: 'my-container' })
		})
	})

	describe('configureBinding', () => {
		test('adds container, durable object binding, and migration', () => {
			const container = createContainer()
			const config = container.configureBinding({ config: emptyConfig, binding: 'CONTAINER', env: 'local' })

			expect(config.containers).toEqual([{
				class_name: 'MyContainer',
				name: 'my-container',
				image: 'docker.io/my-image:latest',
				instance_type: 'standard',
				max_instances: 3,
				rollout_active_grace_period: undefined,
				image_vars: undefined,
			}])
			expect(config.durable_objects?.bindings).toEqual([{ name: 'CONTAINER', class_name: 'MyContainer' }])
			expect(config.migrations).toEqual([{ tag: 'v0001', new_sqlite_classes: ['MyContainer'] }])
		})

		test('does not duplicate migration if class exists', () => {
			const container = createContainer()
			const existing = {
				migrations: [{ tag: 'v0001', new_sqlite_classes: ['MyContainer'] }],
			} as Config
			const config = container.configureBinding({ config: existing, binding: 'CONTAINER', env: 'local' })

			expect(config.migrations).toHaveLength(1)
		})

		test('includes optional configuration', () => {
			const container = createContainer({
				rolloutActiveGracePeriod: 300,
				imageVars: { NODE_ENV: 'production' },
			})
			const config = container.configureBinding({ config: emptyConfig, binding: 'CONTAINER', env: 'local' })

			expect(config.containers![0].rollout_active_grace_period).toBe(300)
			expect(config.containers![0].image_vars).toEqual({ NODE_ENV: 'production' })
		})

		test('uses state name when available', () => {
			const container = createContainer()
			const config = container.configureBinding({
				config: emptyConfig,
				binding: 'CONTAINER',
				state: { name: 'prod-my-container' },
				env: 'production',
			})

			expect(config.containers![0].name).toBe('prod-my-container')
		})
	})
})
