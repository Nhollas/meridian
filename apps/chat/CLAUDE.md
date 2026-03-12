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

- Browser tests: `tests/ui/**/*.test.tsx` — Playwright with Chromium, React component testing
- MSW browser worker setup in `tests/ui/msw.ts`, global setup in `tests/setup/browser.ts`
