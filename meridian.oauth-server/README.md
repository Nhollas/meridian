# Meridian OAuth Server

`meridian.oauth-server` packages and deploys a non-production OAuth server for Meridian using Keycloak.

The intent is:

- `meridian.cli` can point to a shared Meridian issuer in non-production environments
- this repository owns that issuer, its realm configuration, and the `meridian-cli` public client
- this repository also seeds the non-production users needed to exercise the CLI end to end
- local development can still override issuer settings when needed

## What This Repo Contains

- A Docker image based on the official Keycloak image
- A Meridian realm import with the `meridian-cli` device-flow client enabled
- GitLab Auto DevOps configuration for building the image and deploying it to Kubernetes

For the small amount of repository-specific guidance and architecture context that is not obvious from the code, see:

- [`AGENTS.md`](./AGENTS.md)
- [`runbook.md`](./runbook.md)
- [`docs/adrs/README.md`](./docs/adrs/README.md)

## Local Development

Start Keycloak locally:

```bash
docker compose up --build
```

Install the repo's local tooling once to enable Git hooks:

```bash
npm install
```

Then use:

- Local admin console: `http://localhost:8080/admin`
- Admin username: `admin`
- Admin password: `admin`
- Meridian issuer: `http://localhost:8080/realms/meridian`
- Meridian client ID: `meridian-cli`
- Seeded Meridian user: `meridian-dev`
- Seeded Meridian password: `meridian-dev`

Example CLI usage against the local server:

```bash
export MERIDIAN_AUTH_ISSUER=http://localhost:8080/realms/meridian
meridian auth login
```

## Realm As Code

For this playground, treat `keycloak/realm-import.json` as the source of truth.

It currently defines:

- realm: `meridian`
- client: `meridian-cli`
- seeded user: `meridian-dev`

Because the deployment uses the in-memory `dev-mem` database, redeploying the service reapplies that realm import from scratch. If you need a new non-production user, add it to the import file and redeploy rather than relying on the hosted admin UI.

## Kubernetes Deployment Model

This repo is designed to follow the same pattern as other internal services:

- build a Docker image in GitLab
- publish the image through the shared pipeline
- deploy to Kubernetes using the shared Auto DevOps Helm flow

This scaffold uses an optimized Keycloak image with the in-memory `dev-mem` database for playground deployments. That keeps the setup simple and compatible with the platform's read-only container filesystem, but it is not suitable for production or for durable state.
Production deployment jobs are explicitly disabled in `.gitlab-ci.yml` so this repository cannot be promoted to production through the shared Auto DevOps flow by accident.

The hosted Keycloak admin console is not part of the supported playground workflow. The shared ingress layer injects frame-blocking headers that break Keycloak's browser-side login check. Use `realm-import.json` for normal changes.

For deployment steps, runtime constraints, health checks, and required deployment variables, use [`runbook.md`](./runbook.md).
