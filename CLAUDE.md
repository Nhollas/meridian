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
- Run `pnpm lint` and `pnpm typecheck` before considering work complete — they catch style and correctness issues that don't need to be documented.

## Git workflow

- Branch naming: `<type>/<kebab-description>` where type is feat, fix, chore, docs, refactor, test
- Commits: conventional commits (enforced by commitlint)
- No direct commits to main
