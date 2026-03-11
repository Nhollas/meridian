# ADR-001: CLI-First Interface for Agent Consumption

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Context

The Meridian initiative started from the idea that an AI agent should be able to drive a meaningful comparison journey using ordinary shell commands. The early design question was whether to begin with:

- a CLI that any shell-capable agent could use
- an MCP server or another dedicated agent integration surface
- a direct API surface designed specifically for agent callers

At the time the proof of concept began, the main thing to validate was not transport mechanics. It was whether the comparison journey could be exposed in a way that remained discoverable, auditable, and usable by an agent without requiring a custom runtime integration.

## Options Considered

### 1. CLI-first interface

Expose Meridian through a conventional command-line interface with structured output.

**Pros:**

- Any agent that can execute shell commands can use the product immediately.
- The command surface is inspectable with `--help`, which makes discovery straightforward for both humans and agents.
- Every interaction is auditable through commands, arguments, stdout, and stderr.
- The same CLI can be used locally by engineers before any hosted runtime exists.

**Cons:**

- Some agent hosts prefer tool-native integrations.
- Command composition, output handling, and long-running auth flows need careful CLI design.

### 2. MCP server first

Expose Meridian as an MCP server with tools and schemas from the start.

**Pros:**

- Native fit for hosted agent tooling.
- Tool schemas and invocation patterns are explicit.

**Cons:**

- Adds a protocol and server layer before the core interaction model is proven.
- Reduces the ability to test the main thesis that a well-designed CLI may already be sufficient.
- Requires host integration work earlier in the project.

### 3. Direct API first

Expose a service API intended for agent and application callers, with no CLI as the primary surface.

**Pros:**

- Could align more directly with the eventual service architecture.
- Easier for other applications to integrate directly once the APIs exist.

**Cons:**

- Does not validate the CLI-first thesis.
- Pushes discovery, usability, and auditability concerns into whichever client layer is built on top.
- Depends on backend work that was not yet available.

## Decision

**We chose a CLI-first interface for the proof of concept.**

The CLI is the most direct way to validate the central hypothesis: an agent that can use a shell may not need a bespoke integration surface in order to complete a useful comparison journey.

This keeps the first proof close to the user journey itself:

- authenticate
- discover Products
- retrieve the Product Schema
- create a Proposal Request
- create a Proposal
- retrieve the Result

The CLI is therefore both the product surface being tested and the development tool used to test it.

## Consequences

- **Local and hosted agent stories stay aligned.** The same binary can be used from a developer terminal today and from a future hosted runtime later.
- **Discovery matters more.** Help text, command naming, exit codes, and structured output become part of the product design rather than implementation detail.
- **The CLI is not the final architecture boundary.** This decision validates the interaction surface first. It does not rule out a future MCP wrapper or direct service integrations.
- **Architecture can evolve incrementally.** When the process APIs and hosted runtime exist, the CLI can remain as the durable agent-facing surface while delegating more work to backend services.

## Related Documents

- [`../proof-of-concept.md`](../proof-of-concept.md)
- [`../cli-reference.md`](../cli-reference.md)
- [`../kdds/KDD-001-initial-agent-integration-surface.md`](../kdds/KDD-001-initial-agent-integration-surface.md)
