# Agent And Runtime Testing Strategy

This document sets the target testing shape for `meridian.chat`'s agent and runtime layers.

The goal is confidence through real boundaries, not confidence through mocked internals.

## Principles

- Test through the highest stable interface that still keeps the test fast and deterministic.
- Mock outside the system boundary.
- Prefer contract doubles over module mocks.
- Keep pure unit tests for transformations and edge cases, but let `/api/chat` integration tests carry most of the confidence.

Applied here:

- OpenAI and LangChain orchestration are outside our deterministic test boundary.
- Docker and the host OS are outside our deterministic test boundary.
- `POST /api/chat`, `createAgentService`, tool wiring, runtime-event mapping, and the `SandboxRuntime` contract are inside our system boundary.

## Naming And Placement

- Use `*.test.ts` for unit tests and narrow module-level tests.
- Use `*.integration.test.ts` for boundary tests that exercise multiple real modules together.
- Co-locate backend tests with the module they own under `src/`.
- Keep `tests/support/` for shared helpers and test doubles only.
- Keep `tests/ui/` for UI suites that span component composition and talk to the `/api/chat` contract through network interception rather than component internals.

Current Vitest projects:

- `unit`: `src/**/*.test.ts`, excluding `src/**/*.integration.test.ts`
- `integration`: `src/**/*.integration.test.ts`
- `ui`: `tests/ui/**/*.test.tsx`

## Layers

### 1. API Boundary Tests

This is the primary confidence layer.

Test through [`route.ts`](../src/app/api/chat/route.ts):

- invoke `POST` directly
- use the real route logic
- use the real `createAgentService`
- use the real runtime tools
- replace only the model/agent runner and runtime implementation with deterministic doubles

Example:

- [`route.integration.test.ts`](../src/app/api/chat/route.integration.test.ts)

This layer should answer:

- did the request validate correctly
- were runtime events streamed in the right order
- did the agent actually call the runtime through the tool contract
- did the final turn payload reflect the streamed work

### 2. Agent Service Tests

This is the supporting orchestration layer.

Test through [`service.ts`](../src/lib/agent/service.ts):

- use the real service
- replace only the agent runner with a deterministic scripted runner
- use a simple runtime contract double

Example:

- [`service.test.ts`](../src/lib/agent/service.test.ts)

This layer should cover service-only concerns that are awkward to express via `/api/chat`, such as:

- stable session/thread propagation
- event aggregation rules
- fallback behaviour when the runner yields no final text or fails in specific ways
- process-local conversation memory semantics; continuity is available within a running process, but the default in-memory checkpointer should be treated as non-durable across restarts

### 3. Runtime Adapter Tests

This is the supporting adapter layer.

Test the concrete runtime adapter directly:

- use the real `createDockerRuntime`
- mock only Docker CLI process boundaries and filesystem boundaries

Example:

- [`docker-runtime.test.ts`](../src/lib/sandbox/docker-runtime.test.ts)

This layer should answer:

- are we issuing the right Docker commands
- are we isolating sessions correctly
- are auth, proxy, and CA settings forwarded correctly
- are TTL cleanup and background-process flows correct

## Test Doubles

The intended reusable doubles are:

- [`in-memory-runtime.ts`](../tests/support/in-memory-runtime.ts): deterministic `SandboxRuntime` contract double for route/service tests
- [`scripted-agent-runner.ts`](../tests/support/scripted-agent-runner.ts): deterministic runner double that can execute the real runtime tools passed to it
- [`chat-route.ts`](../tests/support/chat-route.ts): shared helpers for `/api/chat` requests and streamed runtime-event parsing

These doubles are preferred over:

- `vi.mock("@/lib/agent/service")`
- `vi.mock("@/lib/sandbox")`

Those module mocks bypass too much of the real system and should not be the default pattern for new agent/runtime tests.

## Abstraction Rule

- Extract a shared helper only after the same setup appears in at least three tests.
- Shared helpers should remove noise, not hide behavior.
- If a helper makes it harder to see the request, runtime events, or expected user-visible behavior, it is too abstract.

## Out Of Scope For This Slice

This strategy document is only for the agent and runtime layers.

UI tests now have a separate strategy document in [`testing-ui.md`](./testing-ui.md).
