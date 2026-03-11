# UI Testing Strategy

This document defines the testing shape for `meridian.chat`'s UI layer.

The goal is the same as the backend suite:

- test through stable consumer-visible behavior
- couple to the network contract, not backend implementation details
- keep tests readable enough that humans and coding agents can target one behavior at a time

## Core Rule

The UI should not care which implementation serves `/api/chat`.

UI tests should only care about the HTTP contract:

- request method, headers, and JSON body
- streamed NDJSON runtime events
- error responses and interrupted streams

That means UI tests should not:

- import route helpers
- mock component internals
- assert on internal state setters or hook behavior

## Test Harness

The UI suite uses:

- Vitest Browser Mode
- the Playwright provider
- `setupWorker` from `msw/browser`

This keeps the suite contract-first in a real browser and matches the direction used in the other repo.

MSW browser mode requires the generated [`mockServiceWorker.js`](../public/mockServiceWorker.js) asset.
Treat that file as generated infrastructure, not handwritten test code.

## Structure

Behavior tests live under `tests/ui/`.

Current support files:

- `chat-contract.ts`: helpers for NDJSON runtime-event responses
- `chat-page-object.ts`: page-object style UI interactions and assertions
- `chat-page-fixture.tsx`: shared render fixture for the `Chat` component
- `msw.ts`: shared browser-worker setup

Current behavior groups:

- `chat.render.test.tsx`
- `chat.submission.test.tsx`
- `chat.loading.test.tsx`
- `chat.error.test.tsx`
- `chat.debug.test.tsx`

## What Good UI Tests Should Read Like

They should read like a user talking to the chat UI and the UI talking to the `/api/chat` contract.

Good:

- user sends a message
- UI disables controls while the stream is open
- UI renders streamed assistant deltas and tool activity
- UI shows interrupted state when the stream fails

Bad:

- asserting how many times `setState` ran
- stubbing component internals
- depending on backend implementation modules instead of the network contract

## Maintenance Rule

- Split files by user-visible behavior, not by component filename.
- Extract shared helpers only when they remove noise without hiding the contract.
- If a UI test needs lots of backend knowledge, the seam is wrong.
