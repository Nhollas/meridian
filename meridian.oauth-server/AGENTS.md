# Meridian OAuth Server Agent Guidance

This file exists for repository-specific rules that are not obvious from scanning the codebase.

## Read These First

- [`README.md`](./README.md): repo purpose, local development, and runtime constraints
- [`runbook.md`](./runbook.md): deployment and operations runbook for the non-production Keycloak instance
- [`docs/adrs/README.md`](./docs/adrs/README.md): architectural decisions that explain why this repository exists in its current form

## Source Of Truth

- Treat [`keycloak/realm-import.json`](./keycloak/realm-import.json) as the source of truth for the Meridian realm, client, and seeded users.
- Do not treat the hosted Keycloak admin UI as a normal configuration path. Runtime changes there are disposable and may be lost on redeploy.
- This repository is for non-production use only. It is a playground issuer for Meridian, not a production identity platform.

## Change Guidance

- If you change realm structure, seeded users, client scopes, or auth capabilities, update [`README.md`](./README.md).
- If you change deployment behaviour, runtime constraints, or operational steps, update [`runbook.md`](./runbook.md).
- If you add or revise a durable architectural decision, update [`docs/adrs/README.md`](./docs/adrs/README.md).

## Important Constraints

- The deployment uses Keycloak with the in-memory `dev-mem` database. State is not durable across redeploys or pod replacement.
- The Kubernetes platform runs with a read-only root filesystem. The `/dev/shm` and health endpoint configuration are operational requirements, not incidental implementation details.
- The hosted admin console is not a supported workflow because the shared ingress injects frame-blocking headers that break Keycloak's browser-side login check.
- Changes here may need corresponding validation in `meridian.cli`, especially if the issuer URL, client ID, scopes, or Device Flow behaviour change.
