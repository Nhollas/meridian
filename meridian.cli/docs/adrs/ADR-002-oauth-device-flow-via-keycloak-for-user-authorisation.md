# ADR-002: OAuth Device Flow via Keycloak for User Authorisation

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Context

The CLI is intended to be driven by an agent on behalf of a human user. That creates a trust-boundary problem: the agent needs a usable way to act on behalf of the user, but the user should still authenticate directly with an identity provider rather than passing credentials to the agent session.

The chosen auth approach also needed to work in both of these environments:

- a local terminal session where the CLI itself does not own a browser
- a future hosted runtime where the user may interact through a chat surface such as Slack

There was also an organisational constraint. Compare the Market already has its own identity provider, but that platform was not a practical integration target for this proof of concept. It was not feasible to integrate with it within the scope of this work, and it was not clear that it supported the OAuth 2.1 Device Flow needed for the intended agent experience.

## Options Considered

### 1. OAuth Device Flow via Keycloak

The CLI requests a device code, displays a verification URL and user code, then polls until the user completes sign-in in a browser.

**Pros:**

- Keeps the user's credentials out of the CLI and the agent runtime.
- Works naturally in terminals and chat-based interfaces.
- Makes the authorisation boundary explicit and auditable.
- Uses a standard OAuth flow that Keycloak already supports.
- Could be stood up and controlled within the proof-of-concept scope.

**Cons:**

- Polling introduces a long-running command.
- The user must switch to a browser to complete sign-in.

### 2. Browser-based auth flow initiated directly by the CLI

The CLI launches or redirects to a local browser and handles a redirect-based flow such as PKCE.

**Pros:**

- Familiar pattern for interactive local applications.

**Cons:**

- Much less natural for remote or headless agent runtimes.
- Requires redirect handling and local callback assumptions that do not map well to chat surfaces.

### 3. Shared service credentials or copied bearer tokens

Use service credentials, manually copied access tokens, or another shortcut that avoids an interactive user authorisation step.

**Pros:**

- Fast to prototype.

**Cons:**

- Weakens the trust boundary the proof of concept is trying to validate.
- Makes auditability and user delegation less credible.
- Encourages patterns that would be inappropriate for a real agent acting on behalf of a user.

### 4. Integrate directly with the existing organisational identity provider

Use the existing Compare the Market identity platform rather than a dedicated Keycloak realm for the proof of concept.

**Pros:**

- Closer to the organisation's established identity estate.
- Potentially reduces future migration work if the long-term platform uses that IdP directly.

**Cons:**

- Not feasible within the delivery scope of the proof of concept.
- Did not provide a clear path to the OAuth 2.1 Device Flow behaviour required here.
- Would have introduced external dependency and coordination risk into a proof whose primary purpose was to validate the CLI interaction model.

## Decision

**We chose OAuth Device Flow via Keycloak.**

The proof of concept needs a real user authorisation boundary, not a placeholder. Device Flow provides that boundary without assuming the agent runtime owns a browser session. The user authenticates directly with Keycloak, and the CLI simply waits for completion.

This is also the most transferable choice between the current local CLI experience and the future hosted runtime. A terminal, a sandbox, and a chat bot can all present a verification URL and continue once the user has completed authorisation elsewhere.

Keycloak was chosen as the practical way to deliver that boundary in the proof-of-concept timeframe. The decision was not that the organisational IdP is strategically unimportant. It was that the existing platform was not a viable route to the required flow within scope.

## Consequences

- **The auth story is real.** Even though comparison data is mocked today, the user authorisation model is genuine.
- **Long-running output is part of the interface.** `auth login --json` needs event-style output because authorisation is asynchronous from the agent's perspective.
- **Keycloak is part of the current architecture.** Realm setup, client configuration, and seeded users matter for development and non-production usage.
- **This is a pragmatic proof-of-concept choice.** Future architecture can revisit the identity platform once the broader agent and service landscape is clearer.
- **The flow remains suitable for hosted runtimes.** The same basic interaction can be presented in Slack or another communication channel later.

## Related Documents

- [`../proof-of-concept.md`](../proof-of-concept.md)
- [`../cli-reference.md`](../cli-reference.md)
- [`../kdds/KDD-002-authentication-flow-options-for-agent-driven-cli.md`](../kdds/KDD-002-authentication-flow-options-for-agent-driven-cli.md)
