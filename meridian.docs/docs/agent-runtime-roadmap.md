# Agent Runtime Roadmap

**Author**: Codex
**Date**: 2026-03-10
**Status**: Draft

## Purpose

This document captures the concrete implementation roadmap for Meridian's next runtime and agent capabilities.

It is narrower than [`system-overview.md`](./system-overview.md) and more execution-focused than [`agent-runtime-vision.md`](./agent-runtime-vision.md). The goal is to record the recommended order of change so future work does not depend on chat history or prompt memory.

## Scope

This roadmap focuses on the platform capabilities that make the agent feel substantially more capable without tying the architecture to Meridian-specific workflows.

Current roadmap:

- typed runtime and agent events
- first-class tasks with resumability and persistence
- stronger background work orchestration
- replay and operator observability built on top of tasks and events

Out of scope for this roadmap:

- runtime policy engine as a dedicated phase
- capability adapters as a dedicated phase
- first-class artifacts
- schema-driven slot filling for the conversational flow
- persistent user memory
- multi-channel continuity

## Design Principles

### Keep the runtime generic

The core runtime should work for Meridian, a future non-comparison domain, or a different installed CLI entirely.

That means the shared contracts should be based on concepts such as:

- task state
- user action required
- background work started or completed
- tool started, completed, or failed
- turn completed or failed

The shared contracts should not be based on Meridian-specific labels.

### Build only the substrate we need now

This roadmap should solve concrete runtime problems in the order they are actually needed.

That means:

- build the shared event model first
- make work durable through first-class tasks
- upgrade background execution only after tasks exist
- avoid adding new core layers unless they are paying for themselves immediately

### Avoid rework by building the substrate first

Several important runtime behaviors depend on the same missing foundation:

- task resumability
- replay
- reconnect-safe progress
- operator visibility into in-flight or failed work

The right order is to build the common foundation once and layer capabilities on top of it.

### Prefer TDD for runtime and agent changes

Wherever practical, implementation should follow a TDD approach:

1. write the failing behavioral or contract test first
2. implement the smallest change that makes it pass
3. refactor only after the behavior is locked in

The most valuable tests for this roadmap are behavioral tests around stable boundaries:

- event emission contracts
- task lifecycle transitions
- repository contracts
- background operation behavior
- replay and recovery behavior

Pure unit tests are still useful for isolated state-transition logic, but they should support the higher-value behavioral and functional tests rather than replace them.

## Testing Strategy

### General test rules

- Prefer behavior and contract tests over tests that assert private implementation details.
- Add unit tests for pure event, translation, and state-transition logic.
- Add integration tests whenever streaming, persistence, replay, or background execution behavior changes.
- Keep at least one end-to-end or API-level happy path per phase so the system is tested the way a real consumer experiences it.
- When adding a new abstraction such as a repository interface, create contract tests that every implementation must pass.

### Test harness expectations

The next implementation agent should treat test support as part of the feature, not as follow-up work.

Expected harness additions over time:

- fixtures for normalized events
- task lifecycle fixtures covering active, waiting, completed, and failed states
- repository contract tests shared by storage implementations
- background-operation fixtures for completion, timeout, and failure
- trace replay fixtures that assert event ordering

### Minimum release expectation

No phase should be considered complete unless:

- the new behavior is covered by failing-then-passing tests
- the tests exercise the public or contract boundary for that phase
- at least one regression test protects the main user-facing path added in that phase

## Recommended Execution Order

The recommended order is:

1. unified event model
2. first-class tasks with persistence
3. background orchestration upgrade

This order is intended to minimise redesign and make each step a substrate for the next one. Replay and observability should be delivered as part of these phases rather than treated as separate speculative work.

## Progress Update

Current implementation progress as of 2026-03-10:

- Phase 1 is implemented in `meridian.chat`.
- The chat backend now streams normalized runtime events instead of a chat-specific wire format.
- The chat UI consumes the normalized event stream through a projection layer and still preserves the existing user-visible experience.
- Debug trace export captures the normalized runtime event stream in order.
- An attempted runtime policy engine was not retained and is not part of the current roadmap.
- The next runtime feature should start from the Phase 1 substrate and move into durable tasks.

## Phase 1: Unified Event Model

### Goal

Introduce one generic event envelope that the runtime and agent can emit consistently, regardless of capability domain.

### Why first

Tasks, replay, background work, and operator visibility all need a shared event vocabulary. If the event model is postponed, those later features will end up inventing incompatible state shapes.

### Suggested event families

- `assistant.delta`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `task.state_changed`
- `user_action.required`
- `background.started`
- `background.completed`
- `turn.completed`
- `turn.failed`

### First deliverable

Keep the current chat UI behavior, but normalize backend streaming around this shared event model so the UI is no longer coupled only to prose plus tool-call output.

### Behavioral and functional tests

The implementation agent should add tests for:

- event contract serialization and validation for each generic event family introduced in this phase
- orchestration-level emission of normalized events from an existing turn
- API or route streaming tests that prove the current UI can still consume the response path without regression
- trace or debug export tests that show the normalized event stream is captured in order

The most important red-green sequence in this phase is:

1. write a failing test for the normalized event shape expected from a representative turn
2. make the orchestration layer emit those events
3. prove the existing UI path still works through an integration test

## Phase 2: First-Class Tasks With Persistence

### Goal

Move from single-turn execution to durable task ownership.

### What a task enables

A task is the durable unit of work that survives beyond one turn.

This enables:

- a user starting work, refreshing, and resuming the same task
- a long-running task continuing while the client disconnects
- clearer UI states such as `running`, `waiting_for_user`, `completed`, and `failed`
- replay and operator visibility without scraping chat transcripts

### Suggested task responsibilities

- own turns
- own current state
- own active background operations
- own pending user actions
- own the event timeline for replay

### Behavioral and functional tests

The implementation agent should add tests for:

- task lifecycle transitions such as `running` to `waiting_for_user` to `completed`
- task resume behavior after process or client restart
- repository contract tests that every persistence implementation must satisfy
- replay tests proving a task can be reconstructed from persisted state and event history
- concurrency or ordering tests around appending events and updating task state

Because MongoDB is the intended first persisted implementation, Phase 2 should include:

- repository contract tests that run against the MongoDB-backed implementation
- integration tests proving a task survives persistence and can be loaded again in a fresh application instance
- regression tests that ensure the orchestration layer remains unaware of MongoDB-specific details

## Phase 3: Background Orchestration Upgrade

### Goal

Turn detached processes into task-owned background operations that emit events.

### Why after tasks

Background work becomes much easier to reason about once it belongs to a task with an event log and clear state.

### Outcome

Long-running work should feel native to the system rather than a special detached process:

- start
- report progress or waiting state
- complete
- fail
- time out
- be resumed or reattached later

### Experience impact

This is what enables reconnect-safe progress, clearer UI than a single message saying "still running", and reliable operator visibility into the final outcome.

### Behavioral and functional tests

The implementation agent should add tests for:

- background operation start, completion, failure, timeout, and termination behavior
- task event emission during background work
- reconnect or reattach flows where a client resumes observing an in-flight operation
- regression tests proving no completion event is lost if the user disconnects while work continues

The highest-value tests here are end-to-end behavioral tests around:

- start background work
- disconnect observer
- complete work
- reconnect and confirm the final state and event history are intact

## Persistence Decision

### Current decision

When Phase 2 begins, the first persisted implementation should use MongoDB behind a storage abstraction.

This is the current recommendation because:

- MongoDB aligns better with existing organizational tooling and familiarity
- it remains easy enough to run locally for development
- it is a more natural fit if the shared agent or runtime service becomes multi-instance sooner rather than later
- it avoids introducing a persistence technology that the wider organization may not want to operate long term

This does not change the more important architectural rule: the orchestration layer must not depend directly on MongoDB-specific concerns.

### Practical persistence guidance

The first storage abstraction should hide:

- task creation and retrieval
- task state updates
- event append and event listing
- background operation state updates

The rest of the system should not know:

- collection names
- MongoDB query syntax
- MongoDB transaction APIs
- document IDs beyond stable domain identifiers exposed by the repository interface

## Implementation Guidance For The Next Agent

### The next milestone should stay narrow

Do not try to implement the entire roadmap in one pass.

The next milestone should be:

1. define the task aggregate and repository interface
2. persist tasks and event timelines in MongoDB
3. load an existing task in a fresh application instance
4. keep the current chat experience working on top of persisted task state

That milestone should follow TDD:

1. write failing tests for task lifecycle transitions
2. write failing repository contract tests
3. write a failing integration test for task reload in a fresh app instance
4. then implement the minimum code to make those tests pass

### Non-goals for the next milestone

The next implementation agent should avoid:

- redesigning the entire chat UI
- solving background orchestration in the same change
- reintroducing policy engine work as a core roadmap phase
- reintroducing capability adapters as a core roadmap phase
- introducing artifacts before there is a concrete task-owned use case
- coupling the task model or orchestration layer directly to MongoDB

### Suggested repo seams

The current code already has useful seams. The next implementation should preserve and sharpen them rather than move everything at once.

Suggested ownership:

- `meridian.chat`: current web adapter, streaming UI, local integration while the shared runtime still lives here
- shared orchestration contracts: event types, task types, repository interfaces
- runtime implementation: command execution, task orchestration, background work hooks
- persistence implementation: MongoDB mapping and repository code

If a later extraction happens, these seams should move cleanly rather than needing a redesign.

### Suggested implementation sequence inside Phase 2

The next implementation agent should likely work in this order:

1. define the task aggregate, task states, and repository contracts
2. add contract tests for repository behavior
3. implement the MongoDB-backed repository
4. persist task state and event history together
5. reload and reconstruct a task in a fresh app instance
6. wire the current orchestration and UI path to the persisted task model

Each step above should begin with a failing behavioral or contract test before implementation starts.

### Acceptance criteria for the next milestone

The next milestone should be considered successful when:

- a task can survive refresh or process restart
- the backend can reload a task and continue from persisted state
- replay and debugging can read the persisted event history for that task
- the current UI can still render the existing experience without regression
- the new behavior is protected by tests that were written before the implementation and would fail without it

### Guidance for the later background orchestration phase

When Phase 3 begins, the next implementation agent should:

1. attach background operations directly to a task
2. emit task-scoped background lifecycle events
3. support reattach or resume flows for in-flight work
4. guarantee that completion or failure state is not lost if the observer disconnects

### Things worth deciding explicitly before Phase 2 starts

Before implementing persisted tasks, it will be useful to make small explicit decisions on:

- stable task ID format
- whether event ordering is per-task only or also globally queryable
- whether background operations are embedded in task documents or stored separately
- how long tasks and events should be retained

These do not all need full ADRs, but they should be recorded in code or docs rather than left implicit.

## Suggested Next Milestone

The smallest high-value milestone is:

1. introduce the task aggregate and repository interface
2. persist tasks and event history
3. support reload and replay of a task in a fresh app instance

This moves the runtime forward without pulling background orchestration or speculative features into the same change.

## Relationship To Other Documents

Use [`system-overview.md`](./system-overview.md) for the current shared system shape.

Use [`agent-runtime-vision.md`](./agent-runtime-vision.md) for the long-term extraction direction and multi-channel target shape.

Use this document for the recommended order of implementation and the rationale behind that order.
