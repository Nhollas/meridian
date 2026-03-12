# @meridian/api

Hono HTTP server with LangGraph agent and Docker sandbox runtime.

## Commands

```bash
pnpm dev                     # start dev server (port 3201)
pnpm test                    # all tests (unit + integration)
pnpm test:unit               # unit tests only
pnpm test:integration        # integration tests only
pnpm test:unit:watch         # unit tests in watch mode
pnpm test:integration:watch  # integration tests in watch mode
pnpm build:sandbox           # build sandbox Docker image
```

## Testing

- Unit tests: `src/**/*.test.ts` — mock external dependencies, test in isolation
- Integration tests: `src/**/*.integration.test.ts` — use in-memory implementations, test systems together
- Test helpers live in `tests/support/` — read these before writing any test
