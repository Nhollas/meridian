# Meridian Chat

`meridian.chat` is the current user-facing web application for Meridian.

It provides the browser chat experience, the backend-for-frontend used by that experience, and the current working implementation of the agent orchestration and runtime integration layers.

## What This Repository Owns

This repository currently owns:

- the browser chat UI
- the Next.js application and API route
- the in-process `Agent service`
- the `SandboxRuntime` contract used by the orchestration layer
- the `DockerRuntime` implementation used for local per-session execution and isolation

The repository therefore contains the current web experience and the runtime implementation needed to support that experience locally.

## Relationship To The Wider System

Meridian is split across several repositories:

- `meridian.cli` owns the CLI capability surface
- `meridian.oauth-server` owns the non-production OAuth issuer used by the CLI
- `meridian.agent-sandbox` captures an earlier sandbox prototype
- `meridian.docs` owns the shared cross-repository documentation

The main shared system description lives in `meridian.docs/docs/system-overview.md`.

This repository should document the current web application behaviour and local runtime setup. It should not become the long-term home for cross-repository architecture material.

## Start Here

Use these documents by purpose:

- [`docs/README.md`](./docs/README.md): documentation index for this repository
- [`docs/docker-runtime-setup.md`](./docs/docker-runtime-setup.md): local Docker runtime setup and usage

For the shared system context, repository split, and forward-looking runtime discussion, use the documents in `meridian.docs`.
