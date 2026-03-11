# Meridian OAuth Server Runbook

This is the short operational runbook for `meridian.oauth-server` as a non-production Keycloak instance.

## What This Repo Deploys

- Keycloak `26.5.3`
- realm: `meridian`
- client: `meridian-cli`
- seeded user: `meridian-dev`
- issuer: `https://cicd-meridian-oauth-server-shadow.vassily.io/realms/meridian`

This deployment is for playground use only. It uses the in-memory `dev-mem` database and is not durable.

## Before You Deploy

Set these GitLab CI/CD variables on the repo:

- `KC_BOOTSTRAP_ADMIN_USERNAME`
- `KC_BOOTSTRAP_ADMIN_PASSWORD`

These create the temporary admin user for the Keycloak admin console.

The Meridian test user used by the CLI is not managed by CI variables. It is defined in `keycloak/realm-import.json`.

The bootstrap admin credentials are still useful for local admin access, but the hosted admin console is not a supported workflow in this playground because the shared ingress injects frame-blocking headers that break Keycloak's browser-side login check.

## How Deployment Works

1. Push to `main`.
2. GitLab builds and publishes the Docker image.
3. The dummy `review` job runs on `main`.
4. The `shadow` job is available as a manual deploy to the `cicd-shadow` environment.

Production deploy jobs are disabled in `.gitlab-ci.yml`.

## Important Runtime Constraints

The Kubernetes platform runs containers with a read-only root filesystem.

Because of that, this image must:

- use `start --optimized`
- use `KC_DB=dev-mem`
- set `JAVA_OPTS_APPEND=-Djava.io.tmpdir=/dev/shm`
- point `/opt/keycloak/data/tmp` at `/dev/shm`

Without those, Keycloak either fails to start or returns `500` for login/admin theme assets.

## Health Checks

Kubernetes probes Keycloak on port `8080` using:

- `/health/live`
- `/health/ready`
- `/health/started`

Keycloak is configured to expose health on the main HTTP port rather than the management port.

## Smoke Test After Deploy

Check these URLs:

- `https://cicd-meridian-oauth-server-shadow.vassily.io/health/live`
- `https://cicd-meridian-oauth-server-shadow.vassily.io/realms/meridian/.well-known/openid-configuration`
- `https://cicd-meridian-oauth-server-shadow.vassily.io/realms/meridian/protocol/openid-connect/auth/device`

Expected:

- health returns `200`
- well-known returns `200`
- device authorisation endpoint accepts the `meridian-cli` client
- device flow can be completed with:
  - username: `meridian-dev`
  - password: `meridian-dev`

## Local Development

Run locally with:

```bash
docker compose up --build
```

Then use:

- local admin console: `http://localhost:8080/admin`
- issuer: `http://localhost:8080/realms/meridian`

## Managing Users

For this playground, manage Meridian users in `keycloak/realm-import.json` and redeploy.
