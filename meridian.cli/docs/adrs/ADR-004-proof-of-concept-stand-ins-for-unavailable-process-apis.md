# ADR-004: Proof-of-Concept Stand-ins for Unavailable Process APIs

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Context

The intended long-term architecture is for Meridian CLI to call the Comparison Orchestrator process APIs that house the business logic and state behind the comparison journey. Those APIs would provide the Product catalogue, Product Schemas, Proposal Request lifecycle, Proposal creation, and Result retrieval.

When this proof of concept was built, those Comparison Orchestrator process APIs did not yet exist. Waiting for them would have blocked the ability to validate the core interaction model:

- can an agent discover the available comparison surface?
- can it collect the right data from a Product Schema?
- can it drive a complete journey through commands and structured output?

To keep the proof of concept usable, the CLI needed temporary stand-ins for the missing backend capabilities.

## Options Considered

### 1. Block the proof of concept until the process APIs exist

Do not implement comparison journey commands until the real service layer is available.

**Pros:**

- No temporary architecture to unwind later.
- The first implementation would align directly with the intended backend boundary.

**Cons:**

- Prevents validation of the CLI interaction model now.
- Couples the proof of concept to the delivery schedule of services that do not yet exist.

### 2. Build temporary stand-ins inside the CLI

Store temporary state locally, embed the Product catalogue and Product Schemas, and generate mock Results while keeping the command model aligned with the intended journey.

**Pros:**

- Allows the CLI interaction model to be tested immediately.
- Keeps the command surface close to the eventual system shape.
- Lets auth, UX, output contracts, and onboarding evolve before backend integration exists.

**Cons:**

- Introduces temporary implementation choices that are not the target end-state.
- Requires clear documentation so contributors do not mistake the stand-ins for the intended architecture.

### 3. Build a temporary backend service solely for the proof of concept

Create a separate interim service to mimic the missing Comparison Orchestrator process APIs.

**Pros:**

- Keeps the CLI thinner.
- Closer to the eventual client-server split.

**Cons:**

- Adds extra infrastructure and delivery overhead for a temporary layer.
- Shifts effort away from validating the CLI surface itself.

## Decision

**We chose temporary stand-ins inside the CLI while the real Comparison Orchestrator process APIs are unavailable.**

For the proof of concept, that means:

- Product catalogue and Product Schemas are bundled into the CLI
- Proposal Requests, Proposals, and Results are stored in local JSON state beneath `~/.meridian/`
- Results are generated from mock provider data

This is explicitly a temporary architecture. It exists to make the CLI workable now, not because local state and embedded comparison data are the intended business architecture.

The command model is still designed to align with the eventual Comparison Orchestrator boundary so that the implementation can later be swapped underneath the same conceptual flow.

## Consequences

- **The proof of concept is usable now.** Engineers and agents can validate the end-to-end CLI journey before the backend services exist.
- **The stand-ins are intentionally disposable.** Local files, embedded catalogue data, and mock Results should not be treated as permanent architectural commitments.
- **Documentation must stay explicit.** Contributors need a clear statement that the Comparison Orchestrator process APIs are the intended long-term home of business logic and state.
- **Migration path matters.** Future backend integration should preserve the command semantics where possible, even as the underlying data sources and persistence model change.

## Related Documents

- [`../proof-of-concept.md`](../proof-of-concept.md)
- [`../cli-reference.md`](../cli-reference.md)
- [`../kdds/KDD-003-deferring-process-api-integration-for-the-proof-of-concept.md`](../kdds/KDD-003-deferring-process-api-integration-for-the-proof-of-concept.md)
