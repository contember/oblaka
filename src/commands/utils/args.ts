export const parseArgs = (args: string[]): { named: { [key: string]: string | true }; positional: string[] } => {
	const named: { [key: string]: string | true } = {}
	const positional: string[] = []
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg.startsWith('--')) {
			const key = arg.slice(2)
			const value = args[i + 1]
			if (value && !value.startsWith('--')) {
				named[key] = value
				i++
			} else {
				named[key] = true
			}
		} else {
			positional.push(arg)
		}
	}
	return { named, positional }
}
