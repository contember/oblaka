import { describe, expect, test } from 'bun:test'
import { AiGateway } from '../../src/resources/ai-gateway'
import { Browser } from '../../src/resources/browser'
import { Images } from '../../src/resources/images'
import { ServiceReference } from '../../src/resources/service-reference'
import { VersionMetadata } from '../../src/resources/version-metadata'
import type { Config } from '../../src/types'

const emptyConfig = {} as Config

describe('AiGateway', () => {
	test('configures ai binding', () => {
		const ai = new AiGateway()
		const config = ai.configureBinding({ config: emptyConfig, binding: 'AI', env: 'local' })
		expect(config.ai).toEqual({ binding: 'AI' })
	})
})

describe('Browser', () => {
	test('configures browser binding', () => {
		const browser = new Browser()
		const config = browser.configureBinding({ config: emptyConfig, binding: 'BROWSER', env: 'local' })
		expect(config.browser).toEqual({ binding: 'BROWSER' })
	})
})

describe('Images', () => {
	test('configures images binding', () => {
		const images = new Images()
		const config = images.configureBinding({ config: emptyConfig, binding: 'IMAGES', env: 'local' })
		expect(config.images).toEqual({ binding: 'IMAGES' })
	})
})

describe('VersionMetadata', () => {
	test('configures version_metadata binding', () => {
		const vm = new VersionMetadata()
		const config = vm.configureBinding({ config: emptyConfig, binding: 'VERSION', env: 'local' })
		expect(config.version_metadata).toEqual({ binding: 'VERSION' })
	})
})

describe('ServiceReference', () => {
	test('configures service binding for local env', () => {
		const ref = new ServiceReference('my-api')
		const config = ref.configureBinding({ config: emptyConfig, binding: 'API', env: 'local' })
		expect(config.services).toEqual([{ binding: 'API', service: 'my-api', entrypoint: undefined }])
	})

	test('prefixes service name with env for remote env', () => {
		const ref = new ServiceReference('my-api')
		const config = ref.configureBinding({ config: emptyConfig, binding: 'API', env: 'production' })
		expect(config.services).toEqual([{ binding: 'API', service: 'production-my-api', entrypoint: undefined }])
	})

	test('includes entrypoint when specified', () => {
		const ref = new ServiceReference('my-api', 'admin')
		const config = ref.configureBinding({ config: emptyConfig, binding: 'API', env: 'local' })
		expect(config.services).toEqual([{ binding: 'API', service: 'my-api', entrypoint: 'admin' }])
	})

	test('appends to existing services', () => {
		const ref = new ServiceReference('my-api')
		const existingConfig = { services: [{ binding: 'OTHER', service: 'other-svc' }] } as Config
		const config = ref.configureBinding({ config: existingConfig, binding: 'API', env: 'local' })
		expect(config.services).toHaveLength(2)
		expect(config.services![1]).toEqual({ binding: 'API', service: 'my-api', entrypoint: undefined })
	})
})
