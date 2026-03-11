# Agent And Runtime Behavioral Test Inventory

This document defines the behavioral test inventory for `meridian.chat`'s agent and runtime layers.

The focus is consumer-visible behavior:

- what a caller of `POST /api/chat` can rely on
- what a user should experience when the agent uses the runtime
- what observable runtime-backed behavior must remain stable as the implementation evolves

It is intentionally not a list of modules that need line coverage.

## Scope

This inventory covers:

- `POST /api/chat`
- streamed runtime events
- session continuity
- runtime-backed tool use
- failure and recovery behavior
- background command orchestration

It does not cover:

- browser/UI rendering
- design or interaction polish
- internal implementation details that are not observable at the route or runtime boundary

## Two Behavior Classes

### 1. Contract Behaviors

These are deterministic, consumer-facing guarantees.

They are the backbone of the automated suite and should drive most of our confidence.

Examples:

- invalid input returns `400`
- successful turns stream ordered NDJSON runtime events
- meaningful partial progress is promoted into `turn.completed`
- background command state is inspectable after being started

### 2. Prompt-Led Behaviors

These are behaviors we want from the agent, but they are influenced by prompting and model behavior rather than a hard code contract.

They are still worth testing, but they should not be the backbone of the suite and should usually be expressed through deterministic scripted runners rather than live-model assertions.

Examples:

- the agent fetches runtime instructions first
- the agent prefers read-only exploration before mutating work
- the agent asks for missing information rather than inventing it
- the agent uses help before unknown commands

## Confidence Goal

The suite should answer this question:

> If a consumer sends a realistic message to `/api/chat`, can we trust the API, session continuity, runtime orchestration, event stream, and failure semantics to behave as expected?

That means the target is behavioral confidence, not just branch coverage.

## P0 Behaviors

These should provide the majority of confidence for the current system.

| ID | Consumer behavior | Expected observable outcome | Primary layer | Status |
| --- | --- | --- | --- | --- |
| P0-01 | A caller can submit a valid message and session ID to `/api/chat`. | Response is `200` and streams `application/x-ndjson`. | Route integration | Covered |
| P0-02 | A caller gets a normal validation response for malformed input. | Invalid `sessionId` or empty `message` returns `400` JSON error, not a stream. | Route unit | Covered |
| P0-03 | A successful turn emits ordered runtime events. | `sequence` starts at `1`, is strictly increasing, and the final event is `turn.completed`. | Route integration | Covered |
| P0-04 | Assistant progress can be streamed before the final answer. | One or more `assistant.delta` events arrive before `turn.completed`. | Route integration | Covered |
| P0-05 | Tool activity is visible to the caller during a turn. | `tool.started`, `tool.completed`, and `tool.failed` events carry stable IDs and serialized input/output. | Route integration | Covered |
| P0-06 | The final event contains the authoritative answer for the turn. | `turn.completed.payload.content` is the final answer and `toolCalls` is the final tool timeline. | Route integration | Covered |
| P0-07 | A failed turn with no useful progress is surfaced as a failed turn. | Final event is `turn.failed` with a non-empty error. | Route unit + integration | Covered |
| P0-08 | A failed turn after useful assistant progress still gives the consumer a usable result. | Final event is `turn.completed` with the streamed partial content instead of `turn.failed`. | Route unit + integration | Covered |
| P0-09 | The same session continues the same conversation. | Later turns for the same `sessionId` see prior turn context. | Service integration + route integration | Covered |
| P0-10 | Different sessions are isolated. | Activity in one `sessionId` does not affect another. | Service integration | Covered |
| P0-11 | Runtime instructions are available to the agent as a first-class capability. | `get_runtime_instructions` can be called and its result appears in tool events and final tool timeline. | Route integration | Covered |
| P0-12 | File reads are observable and deterministic. | `read_file` reads session workspace state and surfaces the result through tool events and final turn output. | Route integration | Covered |
| P0-13 | The runtime can create files needed by later steps. | `write_file` persists content and the file is readable in the same session afterward. | Route integration | Covered |
| P0-14 | Command execution results are observable. | `run_command` returns serialized stdout, stderr, and exit code through tool output. | Route integration | Covered |
| P0-15 | A background command can be started and tracked. | `run_command` with `first-stdout-line` and `keepAlive` returns a `backgroundCommandId`, and follow-up tools can inspect or wait on it. | Runtime adapter + route integration | Covered |

## P1 Behaviors

These deepen confidence in realistic workflows and recovery, but are not the first slice.

| ID | Consumer behavior | Expected observable outcome | Primary layer | Status |
| --- | --- | --- | --- | --- |
| P1-01 | The caller can observe a failed tool call without losing the whole turn by default. | `tool.failed` appears in the stream and the turn still completes when the agent can recover. | Route integration | Covered |
| P1-02 | When the runtime command exits non-zero and the agent cannot recover, the turn fails clearly. | Final event is `turn.failed` with an actionable error or a completed partial turn if useful progress already exists. | Route integration | Covered |
| P1-03 | Session workspaces are isolated. | Files written in one session are not visible in another session. | Route integration | Covered |
| P1-04 | Listing the session workspace is observable. | `list_directory` returns files/directories from the session workspace and the result is exposed via tool events. | Route integration | Covered |
| P1-05 | Unknown background commands fail cleanly. | Inspecting, waiting on, or terminating a missing command returns a clear failure. | Runtime adapter + route integration | Covered |
| P1-06 | Background command completion is observable over time. | A command started in the background can later be listed, inspected, and waited to completion. | Runtime adapter + route integration | Covered |
| P1-07 | Background command termination is observable. | Terminating a running background command yields final buffered output and `terminated` status. | Runtime adapter + route integration | Covered |
| P1-08 | Runtime instructions can come from configuration. | If the runtime is configured with an instructions file, the agent receives that content. | Runtime adapter | Covered |
| P1-09 | Large or noisy command output is bounded rather than exploding the system. | Output is truncated predictably and the caller still gets a stable response shape. | Runtime shared + route integration | Covered |
| P1-10 | Session cleanup does not break active work. | Idle sessions are reaped, but active/background work is not incorrectly deleted. | Runtime adapter | Covered |

## P2 Behaviors

These are worthwhile once the P0 and P1 inventory is in place.

| ID | Consumer behavior | Expected observable outcome | Primary layer | Status |
| --- | --- | --- | --- | --- |
| P2-01 | Stream timing debug mode slows event emission without changing event semantics. | Event ordering and payloads remain identical with debug delay enabled. | Route integration | Covered |
| P2-02 | Runtime path safety is enforced. | Attempts to escape the session directory fail clearly. | Runtime shared + route integration | Covered |
| P2-03 | Session restart behavior is explicit. | A process restart loses in-memory conversation history and consumers are not misled into thinking history persists. | Higher-level integration / documentation contract | Covered |
| P2-04 | Default auth/proxy/CA environment reaches sandbox containers. | The runtime environment inside the sandbox reflects configured auth and network settings. | Runtime adapter | Covered |

## Prompt-Led Behavior Inventory

These are real user expectations, but they should be tested with proportionate confidence and not overfit to one model transcript.

| ID | Expected agent behavior | How to test it safely | Priority | Status |
| --- | --- | --- | --- | --- |
| PB-01 | On a new session, the agent fetches runtime instructions before broader exploration. | Prompt contract test plus route integration with scripted tool ordering. | High | Covered |
| PB-02 | The agent does not refetch runtime instructions every turn without reason. | Prompt contract test for turn-to-turn instruction policy. | Medium | Covered |
| PB-03 | The agent prefers small read-only exploration before mutating work. | Prompt contract test for read-only-first guidance. | Medium | Covered |
| PB-04 | The agent asks for missing required information rather than inventing it. | Prompt contract test for missing-information guidance. | High | Covered |
| PB-05 | The agent checks help before running an unfamiliar command. | Prompt contract test for help-first guidance. | Medium | Covered |
| PB-06 | The agent can start background work, do other useful work, then resume the background task. | Route integration with scripted runner and in-memory runtime. | High | Covered |
| PB-07 | The agent does not claim work is still running without a live background command. | Prompt contract test for background-command truthfulness. | Medium | Covered |

These should usually use deterministic runner scripts, not live model calls.

## Recommended Build Order

### Slice 1

Complete the P0 inventory around `/api/chat` success, failure, session continuity, and the basic runtime tools:

- P0-03 through P0-15

### Slice 2

Add the realistic workflow and recovery behaviors:

- P1-01 through P1-07

### Slice 3

Add resilience and boundary hardening:

- P1-08 through P2-04

### Slice 4

Add selected prompt-led behavior tests where they materially improve confidence:

- PB-01, PB-04, PB-06 first

## What We Should Not Optimize For

- Asserting on internal helper calls or call counts inside the route/service
- Live-model transcript snapshot tests as the primary confidence signal
- Coverage targets detached from consumer behavior
- Building a large bespoke test DSL before the repeated setup is real

## Ongoing Maintenance

Keep this inventory aligned with the suite as behaviors change.

- Update the status when a behavior is added, removed, or materially weakened.
- Add new behaviors in consumer-behavior order, not module order.
- Prefer expanding the existing behavior groups before introducing new test abstractions.
