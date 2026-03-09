let runningAtomic = 0
let registered = false
let shouldExit = false
const shutdownHandlers: (() => Promise<void>)[] = []

const shutdown = async () => {
	for (const handler of shutdownHandlers) {
		await handler()
	}
	process.exit(0)
}

export const registerShutdownHandler = (handler: () => Promise<void>) => {
	shutdownHandlers.push(handler)
	return () => {
		shutdownHandlers.splice(shutdownHandlers.indexOf(handler), 1)
	}
}

export const atomic = async <T>(fn: () => Promise<T>) => {
	runningAtomic++
	try {
		return await fn()
	} finally {
		runningAtomic--
		if (shouldExit && runningAtomic === 0) {
			await shutdown()
		}
	}
}

export const registerSignalHandler = () => {
	if (registered) return
	registered = true

	const handleExit = async () => {
		if (runningAtomic > 0) {
			console.log(`\nReceived exit signal. Waiting for ${runningAtomic} operations to complete...`)
			shouldExit = true
		} else {
			await shutdown()
		}
	}

	process.on('SIGINT', handleExit)
	process.on('SIGTERM', handleExit)
}
