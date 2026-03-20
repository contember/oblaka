# Oblaka - Cloudflare Infrastructure as Code

## Stack

- Runtime: Bun
- Language: TypeScript (strict)
- Formatter: dprint (tabs, ASI, single quotes, 150 line width)
- Linter: Biome

## Commands

- `bun run format` / `bun run format:check` - format with dprint
- `bun run lint` / `bun run lint:fix` - lint with biome
- `bun run typecheck` - typecheck with tsc

## Release

npm package `oblaka-iac` is published automatically via GitHub Actions when a `v*` tag is pushed.

Steps to release a new version:

1. Bump `version` in `package.json`
2. Commit: `bump version to X.Y.Z`
3. `git tag vX.Y.Z`
4. `git push && git push --tags`

The release workflow runs lint, format check, typecheck, then `npm publish --provenance --access public`.
