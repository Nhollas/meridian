# KDD-003: Deferring Process API Integration for the Proof of Concept

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Problem

The intended architecture for Meridian is for the Comparison Orchestrator process APIs to house the business logic and state behind the comparison journey. In the target model, the CLI would act as a client of those APIs rather than owning embedded catalogue data, local Proposal state, or mock comparison outputs.

At the point the proof of concept was being built, those Comparison Orchestrator process APIs did not yet exist. The question was whether to wait for that architecture, or to make temporary local choices so the CLI could still be used to validate the agent interaction model.

## Options Considered

### 1. Wait for the real process APIs

Do not implement the comparison journey beyond authentication until the intended backend services are available.

**Pros:**

- No temporary architecture to unwind later.
- Keeps the proof of concept implementation closer to the intended end-state.

**Cons:**

- Delays validation of the CLI interaction model.
- Makes the proof of concept dependent on another delivery stream.

### 2. Use temporary stand-ins inside the CLI

Keep the command model, but implement local stand-ins until the Comparison Orchestrator process APIs exist.

This means:

- bundling Product catalogue and Product Schemas in the CLI
- persisting Proposal Requests, Proposals, and Results in local files
- generating mock Results locally

**Pros:**

- Makes the proof of concept workable now.
- Keeps attention on command shape, auth, onboarding, and output contracts.
- Allows the eventual backend integration to be a replacement of implementation rather than a reinvention of the journey.

**Cons:**

- Temporary design choices can be mistaken for strategic ones if not documented clearly.
- Some migration work will be required later.

### 3. Build an interim service layer first

Create a temporary backend service that mimics the future Comparison Orchestrator process APIs.

**Pros:**

- Keeps the CLI thinner.
- Closer to the target client-server split.

**Cons:**

- Adds cost and complexity for a temporary layer.
- Risks spending effort on scaffolding rather than the actual proof of concept.

## Decision

**Defer Comparison Orchestrator process API integration and use temporary stand-ins inside the CLI for the proof of concept.**

This was the pragmatic path that kept the work moving. The proof of concept needed to become usable before the process APIs existed, and the most important thing to validate was the interaction model, not backend completeness.

## Implications

- Local state, embedded catalogue data, and mock Results are temporary by design.
- The architecture documents need to say clearly that the Comparison Orchestrator process APIs remain the intended long-term location for business logic and state.
- Future backend work should aim to preserve the command semantics so that the current proof of concept remains a useful precursor rather than a discarded branch of thought.

## Related Documents

- [`../adrs/ADR-004-proof-of-concept-stand-ins-for-unavailable-process-apis.md`](../adrs/ADR-004-proof-of-concept-stand-ins-for-unavailable-process-apis.md)
- [`../proof-of-concept.md`](../proof-of-concept.md)
