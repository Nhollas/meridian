# Meridian

Platform for building and running AI agents — provides a chat UI, API server with sandboxed execution, and CLI client.

## Commands

```bash
pnpm install              # install dependencies
pnpm dev                  # start api + chat concurrently
pnpm lint                 # biome check
pnpm lint:fix             # biome check --write
pnpm typecheck            # tsc across all packages
pnpm test                 # vitest across all packages
```

Run for a single package: `pnpm --filter <package-name> run <script>`

## Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@meridian/api` | `apps/api` | Hono HTTP server, LangGraph agent, sandboxed execution runtime |
| `@meridian/chat` | `apps/chat` | Next.js frontend, chat UI for the agent |
| `@meridian/cli` | `apps/cli` | CLI client (Commander), OAuth device flow auth |
| `@meridian/contracts` | `packages/contracts` | Shared Zod schemas and TypeScript types |

## Before writing code

- Read existing code in the area you're changing. Follow the patterns already there.
- Read existing tests before writing new ones. The test helpers ARE the conventions.

## Before considering work complete

- Run `pnpm lint` and `pnpm typecheck` — they catch style and correctness issues that don't need to be documented.
- Leave the codebase better than you found it. Fix pre-existing issues you encounter — for example lint warnings, type errors, or code smells — don't skip them just because they weren't yours.

## Git workflow

- Branch naming: `<type>/<kebab-description>` where type is feat, fix, chore, docs, refactor, test
- Commits: conventional commits (enforced by commitlint)
- No direct commits to main
