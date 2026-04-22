import { describe, expect, test } from 'bun:test'
import { AiGateway } from '../../src/resources/ai-gateway'
import { AiSearch } from '../../src/resources/ai-search'
import { Browser } from '../../src/resources/browser'
import { EmailService } from '../../src/resources/email'
import { Flagship } from '../../src/resources/flagship'
import { Images } from '../../src/resources/images'
import { ServiceReference } from '../../src/resources/service-reference'
import { VersionMetadata } from '../../src/resources/version-metadata'
import { VpcNetwork } from '../../src/resources/vpc'
import { WorkerLoader } from '../../src/resources/worker-loader'
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

describe('EmailService', () => {
	test('configures send_email binding with just name', () => {
		const email = new EmailService()
		const config = email.configureBinding({ config: emptyConfig, binding: 'EMAIL', env: 'local' })
		expect(config.send_email).toEqual([{
			name: 'EMAIL',
			destination_address: undefined,
			allowed_destination_addresses: undefined,
			allowed_sender_addresses: undefined,
			remote: undefined,
		}])
	})

	test('passes through allowed_sender_addresses and remote', () => {
		const email = new EmailService({ allowedSenderAddresses: ['noreply@example.com'], remote: true })
		const config = email.configureBinding({ config: emptyConfig, binding: 'EMAIL', env: 'local' })
		expect(config.send_email![0]).toMatchObject({
			name: 'EMAIL',
			allowed_sender_addresses: ['noreply@example.com'],
			remote: true,
		})
	})

	test('supports Email Routing destination restrictions', () => {
		const email = new EmailService({
			destinationAddress: 'admin@example.com',
			allowedDestinationAddresses: ['admin@example.com', 'ops@example.com'],
		})
		const config = email.configureBinding({ config: emptyConfig, binding: 'EMAIL', env: 'local' })
		expect(config.send_email![0]).toMatchObject({
			destination_address: 'admin@example.com',
			allowed_destination_addresses: ['admin@example.com', 'ops@example.com'],
		})
	})

	test('appends to existing send_email bindings', () => {
		const email = new EmailService()
		const existing = { send_email: [{ name: 'OTHER' }] } as Config
		const config = email.configureBinding({ config: existing, binding: 'EMAIL', env: 'local' })
		expect(config.send_email).toHaveLength(2)
	})
})

describe('WorkerLoader', () => {
	test('configures worker_loaders binding', () => {
		const loader = new WorkerLoader()
		const config = loader.configureBinding({ config: emptyConfig, binding: 'LOADER', env: 'local' })
		expect(config.worker_loaders).toEqual([{ binding: 'LOADER' }])
	})

	test('appends to existing worker_loaders', () => {
		const loader = new WorkerLoader()
		const existing = { worker_loaders: [{ binding: 'OTHER' }] } as Config
		const config = loader.configureBinding({ config: existing, binding: 'LOADER', env: 'local' })
		expect(config.worker_loaders).toHaveLength(2)
	})
})

describe('VpcNetwork', () => {
	test('mesh() uses the cf1:network constant', () => {
		const vpc = VpcNetwork.mesh()
		const config = vpc.configureBinding({ config: emptyConfig, binding: 'MESH', env: 'local' })
		expect(config.vpc_networks).toEqual([{
			binding: 'MESH',
			network_id: 'cf1:network',
			tunnel_id: undefined,
			remote: true,
		}])
	})

	test('tunnel() uses the provided tunnel id', () => {
		const vpc = VpcNetwork.tunnel('550e8400-e29b-41d4-a716-446655440000')
		const config = vpc.configureBinding({ config: emptyConfig, binding: 'VPC', env: 'local' })
		expect(config.vpc_networks).toEqual([{
			binding: 'VPC',
			network_id: undefined,
			tunnel_id: '550e8400-e29b-41d4-a716-446655440000',
			remote: true,
		}])
	})

	test('allows disabling remote flag', () => {
		const vpc = VpcNetwork.mesh({ remote: false })
		const config = vpc.configureBinding({ config: emptyConfig, binding: 'MESH', env: 'local' })
		expect(config.vpc_networks![0].remote).toBe(false)
	})
})

describe('AiSearch', () => {
	test('configures ai_search_namespaces binding', () => {
		const search = new AiSearch({ namespace: 'default' })
		const config = search.configureBinding({ config: emptyConfig, binding: 'AI_SEARCH', env: 'local' })
		expect(config.ai_search_namespaces).toEqual([{
			binding: 'AI_SEARCH',
			namespace: 'default',
			remote: undefined,
		}])
	})

	test('passes remote flag through', () => {
		const search = new AiSearch({ namespace: 'docs', remote: true })
		const config = search.configureBinding({ config: emptyConfig, binding: 'AI_SEARCH', env: 'local' })
		expect(config.ai_search_namespaces![0]).toMatchObject({ namespace: 'docs', remote: true })
	})
})

describe('Flagship', () => {
	test('configures flagship binding with app_id', () => {
		const flags = new Flagship({ appId: 'app-123' })
		const config = flags.configureBinding({ config: emptyConfig, binding: 'FLAGS', env: 'local' })
		expect(config.flagship).toEqual([{ binding: 'FLAGS', app_id: 'app-123' }])
	})

	test('appends to existing flagship bindings', () => {
		const flags = new Flagship({ appId: 'app-2' })
		const existing = { flagship: [{ binding: 'OTHER', app_id: 'app-1' }] } as Config
		const config = flags.configureBinding({ config: existing, binding: 'FLAGS', env: 'local' })
		expect(config.flagship).toHaveLength(2)
	})
})
