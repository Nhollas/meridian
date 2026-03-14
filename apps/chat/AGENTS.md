# @meridian/chat

Next.js frontend — chat UI for interacting with the Meridian agent.

## Commands

```bash
pnpm dev                # start dev server (port 3200)
pnpm test               # browser tests (Playwright + Vitest)
pnpm test:browser       # explicit browser tests
pnpm test:browser:watch # browser tests in watch mode
```

## Testing

- Browser tests: colocated with source in `src/` as `*.test.tsx` files — Playwright with Chromium, React component testing
- Test support files in `tests/support/` (page objects, fixtures, MSW, contracts)
- Global setup in `tests/setup/browser.ts`
