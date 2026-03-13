# @meridian/cli

CLI client built with Commander — OAuth device flow auth, interacts with the Meridian API.

## Commands

```bash
pnpm dev            # run CLI in dev mode
pnpm test           # unit tests
pnpm test:watch     # unit tests in watch mode
pnpm test:coverage  # unit tests with coverage
pnpm build          # esbuild bundle
```

## Testing

- Unit tests: `tests/unit/` — organized by command domain
- MSW for HTTP mocking, setup in `tests/setup/msw.ts`
- Test helpers in `tests/helpers/` (JWT creation, stream mocking, temp home directory)
