# Meridian CLI Proof Of Concept: Context And Scope

**Author**: Nicholas Hollas  
**Date**: 2026-03-06  
**Status**: Current explanation of the proof of concept

## Overview

This document explains why the Meridian CLI proof of concept exists, what it is intended to demonstrate, and which decisions shape its current boundaries. It is an explanation document, not the command reference.

For the current command surface and shipped behaviour, see [`cli-reference.md`](./cli-reference.md).

The proof of concept validates two ideas from the [Future of AI Agents](https://comparethemarket.atlassian.net/wiki/spaces/AIENG/pages/7125925926/The+Future+of+AI+Agents+Why+the+Terminal+Might+Be+All+We+Need) thesis:

1. A well-designed CLI is sufficient for an AI agent to complete a meaningful user journey on behalf of a human.
2. An OAuth 2.1 Device Flow can bridge the trust boundary between an agent-driven CLI and a human who needs to authorise actions in a browser.

The comparison journey in this proof of concept uses mock data for Proposals and Results. Authentication uses a real Keycloak issuer so that the authorisation boundary is genuine.

Compare the Market already has its own identity platform, but that was not a practical integration target for this proof of concept and it was not clear that it supported the OAuth 2.1 Device Flow needed for the intended agent experience.

## Background

Compare the Market's core capability is helping users compare products across providers. Today, that capability is exposed through web and mobile interfaces. As AI agents become more capable, there is an opportunity to expose the same capability through a CLI that any agent with shell access can consume.

The underlying thesis is that CLIs are a natural interface for agents because they are universal, auditable, and composable. An agent that can execute shell commands can use a CLI directly without needing a bespoke protocol adapter. That shifts the problem away from inventing a new transport and towards building a runtime where the agent can work safely and clearly.

This proof of concept builds the CLI side of that model. It demonstrates the user journey from authentication through to viewing comparison results.

## Goals

- Demonstrate the full comparison journey as a sequence of CLI commands that an agent can discover and execute.
- Implement a real OAuth 2.1 Device Flow against a Keycloak instance so that the human authenticates in a browser while the agent waits.
- Provide a `products` command that lists the available Product verticals and their current versions so an agent can discover what comparisons are possible.
- Provide a `product-schemas` command that returns the Product Schema for a given Product and version so an agent can learn what fields it needs to collect.
- Produce structured output that an agent can parse reliably, while still supporting human-readable output where that improves interactive use.
- Keep the comparison journey deliberately small, with mock Proposal and Result data, so the focus remains on the interaction pattern rather than backend integration.

## Non-Goals

- Integrating with the real Comparison Orchestrator process APIs or any live backend service for comparison data
- Building a deployed agent runtime or Slack integration as part of the initial proof of concept
- Building an MCP server wrapper around the CLI
- Supporting every Product vertical
- Delivering production-grade telemetry, retry handling, or platform hardening

Those concerns matter, but they belong to later phases of work. The current shared system shape is described in `meridian.docs/docs/system-overview.md`, and the forward-looking runtime direction is described in `meridian.docs/docs/agent-runtime-vision.md`.

## Defined Terms

These terms align with the Comparison Orchestrator domain model and are used consistently across the CLI documentation set.

| Term | Description |
| --- | --- |
| **Proposal Request** | An optional, mutable resource where product data can be persisted ahead of time. It acts as a draft containing the details a user would normally enter on the website. |
| **Proposal** | The immutable "go compare" event. Creating a Proposal starts the comparison process. |
| **Result** | The collection of provider responses for a given Proposal. |
| **Product** | A product vertical available for comparison, such as broadband or travel insurance. Each Product has one or more supported versions. |
| **Product Schema** | The schema for a given Product and version. It tells the agent what fields are required and what shape the input file must take. |
| **Device Flow** | An OAuth 2.1 authorisation grant designed for devices or runtimes that do not have their own browser session. |

## Design Choices

### CLI-First Interaction

The CLI follows a `meridian <resource> <action>` shape because that pattern is already familiar to people and to tools. The command tree is shallow enough to discover with `--help`, while still being explicit about the resource being acted upon.

This matters for agents. A shell-capable agent does not need a custom integration layer if the CLI is predictable, composable, and able to produce structured output.

### Real Authorisation Boundary

Authentication is deliberately real, even though the comparison data is mocked. The proof of concept is trying to demonstrate that an agent can act on a user's behalf without the user's credentials being copied into the agent session.

The Device Flow is central to that story:

- the CLI requests a device code
- the user completes sign-in in a browser
- the CLI polls until authorisation completes
- the resulting token is stored locally for subsequent commands

That shape mirrors how a deployed runtime would need to behave, whether the interaction starts in a terminal or a chat interface.

### Mock Comparison Data

The Proposal and Result commands use mock provider data. This is deliberate. Integrating with the Comparison Orchestrator process APIs before they exist would add significant dependency risk and would make it harder to isolate the question the proof of concept is trying to answer.

The relevant question is whether the CLI can express the journey in a way that is usable by an agent:

- discover Products
- retrieve the Product Schema
- collect the required data
- create a Proposal Request
- create a Proposal
- retrieve the Result

If that command and data model works well with mock data, the same shape can later be wired to a real backend.

### Local State And Auditability

The CLI stores credentials and comparison data in local JSON files beneath `~/.meridian/`. That choice keeps the proof of concept inspectable. A human or an agent can see exactly what was stored and what the next command will operate on.

This is useful for development, for debugging, and for the broader thesis around auditability. It also keeps the runtime model simple while the command surface is still being proven out.

## Engineering Influence

The project structure, tooling, and engineering conventions for this proof of concept are influenced by the internal Katapult CLI. The important carry-over points are:

- TypeScript with ESM in a single npm package
- esbuild for bundling the standalone Node.js binary
- Vitest for behavioural tests
- Biome for formatting and linting
- dependency injection for filesystem and network collaborators so feature code remains testable

The command structure itself is different. Meridian uses resource-oriented subcommands because the comparison journey has several related resources rather than one narrow workflow.

## Relationship To The Rest Of The Documentation

The documentation set now has clearer boundaries:

- [`README.md`](../README.md) is for package consumers and first-run usage
- [`cli-reference.md`](./cli-reference.md) is the authoritative command reference
- `meridian.docs/docs/system-overview.md` describes the current shared system shape and runtime model
- `meridian.docs/docs/agent-runtime-vision.md` describes future runtime direction beyond the current proof of concept

That split reduces duplication and makes each document easier to maintain. The command reference should change with the binary. This explanation document should change only when the underlying rationale, scope, or important design assumptions change.
