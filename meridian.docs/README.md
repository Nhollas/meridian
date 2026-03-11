# Meridian Documentation

`meridian.docs` is the shared documentation home for the Meridian system.

It exists to hold documentation that spans more than one implementation repository. Its purpose is to make the system easier to understand and easier to change without forcing one product repository to become the default home for cross-repository architecture material.

## What This Repository Is For

Use this repository for:

- system overview documents
- repository ownership and boundaries
- cross-repo runtime architecture and direction
- shared concepts and terminology
- cross-cutting architecture decision records
- cross-cutting decision history
- future direction and roadmap documents that are not owned by a single repository

## What This Repository Is Not For

Do not use this repository for:

- shipped CLI behaviour or command reference
- local setup instructions for a single repository
- repo-specific runbooks
- implementation detail that must stay tightly coupled to code in one repository

Those documents should remain in the repository that owns the code.

## Documentation Index

Start with:

- [`docs/system-overview.md`](./docs/system-overview.md): the primary shared explanation of Meridian, including the repository split, current runtime, and likely future direction
- [`docs/README.md`](./docs/README.md): supporting index and contributor guidance

## Relationship To Implementation Repositories

The current Meridian repositories are:

- `meridian.cli`
- `meridian.chat`
- `meridian.agent-sandbox`
- `meridian.oauth-server`

Each repository should continue to own its local behaviour, setup, and implementation documentation. This repository provides the shared system map across them.
