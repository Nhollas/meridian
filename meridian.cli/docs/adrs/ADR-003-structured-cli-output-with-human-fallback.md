# ADR-003: Structured CLI Output with Human Fallback

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Context

Meridian CLI needs to work well for two audiences at the same time:

- humans using the CLI interactively in a terminal
- agents consuming command output programmatically

If the CLI only optimises for humans, agents are forced to parse prose or tables. If it only optimises for machine callers, local development and debugging become harder than they need to be.

The output model also needs to cover more than simple request-response commands. Authentication includes a waiting phase where a machine caller may need structured updates before the command completes.

## Options Considered

### 1. Structured JSON output with human-readable fallback

Commands provide JSON output for machine callers and human-readable output for interactive TTY usage. `auth login --json` emits NDJSON events while the Device Flow is in progress.

**Pros:**

- Gives agents a stable, parseable contract.
- Keeps interactive terminal usage pleasant for local development and demos.
- Supports both ordinary JSON payloads and event-style progress output for long-running auth.

**Cons:**

- Requires deliberate output design per command.
- The CLI reference must treat output shape as part of the public contract.

### 2. Human-readable output only

All commands print prose or tables and leave parsing to the caller.

**Pros:**

- Easy to design initially.

**Cons:**

- Fragile for agents.
- Makes output wording changes risky because they break machine consumers.

### 3. JSON-only output

Every command emits JSON and leaves human-friendly rendering to another layer.

**Pros:**

- Cleanest machine contract.

**Cons:**

- Worse interactive experience for local CLI usage.
- Makes the CLI less helpful as a standalone product surface.

## Decision

**We chose structured JSON output with human-readable fallback.**

Commands that produce data support machine-readable output, while interactive terminal usage remains readable without extra tooling. When stdout is not a TTY, JSON becomes the default for commands that support both modes.

`auth login --json` uses NDJSON rather than a single JSON document because the Device Flow is eventful:

- a pending state is emitted when the device code is issued
- an authenticated state is emitted once sign-in completes and credentials are stored

## Consequences

- **Output shape is a product contract.** Changes to JSON payloads, NDJSON events, and exit behaviour need documentation and careful review.
- **TTY detection matters.** Output mode is part of the intended behaviour, not just a convenience.
- **Error handling must be deliberate.** Errors need to be useful for humans and structured where machine consumers expect them.
- **Future integrations stay simpler.** Agents, wrappers, and hosted runtimes can rely on the CLI without building a bespoke parser for human-formatted output.

## Related Documents

- [`../cli-reference.md`](../cli-reference.md)
- [`../proof-of-concept.md`](../proof-of-concept.md)
