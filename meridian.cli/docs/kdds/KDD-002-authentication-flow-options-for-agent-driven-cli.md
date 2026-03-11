# KDD-002: Authentication Flow Options for an Agent-Driven CLI

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Problem

Meridian CLI needs to let an agent act on behalf of a user without teaching the user to hand credentials directly to the agent. The authentication model must work in a terminal-based proof of concept today and still make sense in a future hosted runtime.

The key uncertainty was which authorisation flow would preserve the right trust boundary while still being practical for an agent-driven CLI.

There was also a delivery constraint. The organisation already has its own identity platform, but it was not a realistic integration target for this proof of concept, and it was not clear that it supported the OAuth 2.1 Device Flow required for the intended agent experience.

## Options Considered

### 1. OAuth Device Flow

The CLI initiates a device authorisation, presents the verification URL and user code, then waits while the user completes sign-in in a browser.

**Pros:**

- Preserves a clear human authorisation step.
- Works well in terminals and chat surfaces.
- Avoids redirect and callback assumptions in the CLI environment.

**Cons:**

- Requires a polling loop.
- Adds an extra browser step for the user.

### 2. Redirect-based browser flow in the CLI

The CLI opens a browser and expects a local redirect-based flow.

**Pros:**

- Familiar for some interactive local tools.

**Cons:**

- Poor fit for remote or headless agent runtimes.
- Complicates the local environment assumptions.

### 3. Manual or service-level token shortcuts

Use copied tokens, shared credentials, or other shortcuts to bypass user authorisation at runtime.

**Pros:**

- Quick to get working for a prototype.

**Cons:**

- Undermines the trust model being tested.
- Teaches patterns that should not survive into real usage.

### 4. Use the existing organisational identity provider

Integrate the proof of concept directly with the organisation's existing identity platform.

**Pros:**

- Closer to the enterprise identity landscape.
- Could reduce future migration work if it becomes the eventual long-term choice.

**Cons:**

- Not feasible within the proof-of-concept scope.
- No clear path to the Device Flow behaviour needed for agent-driven usage.
- Adds delivery and coordination risk to a proof that primarily needs to validate the user journey.

## Decision

**Use OAuth Device Flow.**

The proof of concept needs a real authorisation model, not a placeholder. Device Flow keeps the user in control of authentication while remaining practical for both local terminal usage and future hosted runtimes.

Keycloak was the practical implementation choice because it could support the required flow within scope. The existing organisational identity provider may still matter later, but it was not the right dependency for this stage of work.

## Implications

- Auth is part of the architecture, not just plumbing.
- Progress events matter because sign-in is asynchronous from the caller's perspective.
- Keycloak configuration is a meaningful part of the development and non-production setup.

## Related Documents

- [`../adrs/ADR-002-oauth-device-flow-via-keycloak-for-user-authorisation.md`](../adrs/ADR-002-oauth-device-flow-via-keycloak-for-user-authorisation.md)
- [`../cli-reference.md`](../cli-reference.md)
