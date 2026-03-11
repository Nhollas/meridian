# ADR-001: Keycloak Realm Import as Code for the Meridian Playground Issuer

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-03-07 |
| **Author** | Nick Hollas |

## Context

`meridian.oauth-server` exists to provide a non-production OAuth issuer for Meridian while the wider platform and product architecture are still taking shape.

Compare the Market already has its own identity provider, but that platform was not a practical integration target for this work. It was not feasible to integrate with it within the scope of the proof of concept, and it was not clear that it supported the OAuth 2.1 Device Flow behaviour needed by `meridian.cli`.

The repository therefore needs a repeatable way to define:

- the `meridian` realm
- the `meridian-cli` public client with Device Flow enabled
- the seeded non-production users needed to exercise the CLI end to end

The deployment model also matters. This Keycloak instance runs as a playground service with the in-memory `dev-mem` database, so runtime state is not durable across redeploys or pod replacement.

## Options Considered

### 1. Manage Keycloak primarily through the admin UI

Use the hosted or local admin console as the main path for creating clients, users, and realm settings.

**Pros:**

- Familiar for interactive administration.
- Quick for one-off experimentation.

**Cons:**

- Changes are hard to review and reproduce.
- Runtime configuration is lost when the playground environment is rebuilt.
- The hosted admin UI is not a reliable workflow in this environment because the shared ingress breaks Keycloak's browser-side login check.

### 2. Treat the realm import as code

Define the realm, client, and seeded users in `keycloak/realm-import.json` and redeploy to apply changes.

**Pros:**

- Reviewable and version-controlled.
- Repeatable across local development and shared non-production deployment.
- Fits the disposable nature of the `dev-mem` deployment model.

**Cons:**

- Less convenient for ad hoc manual changes.
- Requires redeploy or local restart to apply updates.

### 3. Integrate directly with the organisational identity platform

Avoid a dedicated playground Keycloak realm and rely on the existing enterprise identity platform instead.

**Pros:**

- Closer to the organisation's existing identity landscape.
- Could reduce future migration work if that platform becomes the long-term answer.

**Cons:**

- Not viable within the scope and timescale of this work.
- Did not provide a clear path to the Device Flow requirements needed by `meridian.cli`.
- Introduces an external dependency into a repo whose purpose is to keep the Meridian proof of concept workable now.

## Decision

**We chose Keycloak realm import as code for the Meridian playground issuer.**

`keycloak/realm-import.json` is the source of truth for the Meridian realm, the `meridian-cli` client, and the seeded playground users.

That decision matches the role of this repository:

- provide a non-production issuer for Meridian
- keep the configuration reviewable and repeatable
- accept that runtime state is disposable because this is a playground service

## Consequences

- **Realm changes are code changes.** Updates to clients, users, and realm settings should be made in `realm-import.json`, not treated as UI-only state.
- **The hosted admin UI is not authoritative.** Even if a runtime change is possible locally, it is not the supported long-term configuration path.
- **This repo remains intentionally temporary in scope.** It enables the Meridian CLI proof of concept and shared non-production testing, rather than defining the final identity architecture.
- **Future platform decisions can revisit the identity provider choice.** This ADR records a pragmatic solution for the current stage of work, not a claim that Keycloak is the strategic end-state.

## Related Documents

- [`../../README.md`](../../README.md)
- [`../../runbook.md`](../../runbook.md)
