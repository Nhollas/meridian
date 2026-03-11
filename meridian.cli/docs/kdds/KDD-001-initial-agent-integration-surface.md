# KDD-001: Initial Agent Integration Surface

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Problem

Meridian needed an initial integration surface that would let an AI agent complete a meaningful comparison journey on behalf of a human user. The uncertainty was not simply which technology to use. The more important question was what needed to be validated first:

- the viability of the comparison journey as an agent workflow
- the service boundary for long-term backend architecture
- the protocol used by hosted agent platforms

Choosing the wrong first surface would have forced the proof of concept to answer a different question from the one it set out to test.

## Options Considered

### 1. CLI as the initial integration surface

Expose the journey through shell commands with structured output.

**Pros:**

- Directly validates the thesis that a well-designed CLI may be enough for agents.
- Works immediately in local development environments.
- Keeps the interaction auditable and easy to inspect.
- Does not depend on a hosted runtime or a specific agent protocol.

**Cons:**

- Requires careful command and output design.
- Some future hosts may still prefer a tool-native protocol layer.

### 2. MCP server as the initial integration surface

Start with an MCP server and expose Meridian capabilities as tools.

**Pros:**

- Strong fit for emerging hosted agent ecosystems.
- Tool schemas are first-class.

**Cons:**

- Adds transport and server work before the interaction model itself is proven.
- Tests MCP adoption more than it tests the CLI-first thesis.

### 3. Direct service API as the initial integration surface

Start with a network API intended for application and agent callers.

**Pros:**

- Closer to the eventual service architecture.
- Reusable beyond CLI use cases.

**Cons:**

- Depends on backend capabilities that were not yet available.
- Leaves agent usability and discoverability to a separate client layer.

## Decision

**The proof of concept should start with a CLI as the initial integration surface.**

The most important thing to validate first is whether the comparison journey can be expressed clearly enough that a shell-capable agent can drive it without a bespoke integration. That is the central claim being tested. The CLI gives the cleanest path to that validation.

## Implications

- The proof of concept can move before a hosted runtime exists.
- CLI help, structured output, and auth ergonomics become first-class design concerns.
- MCP or other protocol layers remain possible later, but they are not the first question to answer.

## Related Documents

- [`../adrs/ADR-001-cli-first-interface-for-agent-consumption.md`](../adrs/ADR-001-cli-first-interface-for-agent-consumption.md)
- [`../proof-of-concept.md`](../proof-of-concept.md)
