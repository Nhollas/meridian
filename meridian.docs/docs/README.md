# Meridian System Documentation

This directory is the documentation index for the shared Meridian system.

Use these documents by purpose rather than reading them all in sequence. In most cases, contributors should start with a single document: [`system-overview.md`](./system-overview.md).

## Start Here

- [`system-overview.md`](./system-overview.md): the primary shared description of Meridian, covering the repositories, runtime shape, trust boundaries, and likely next architectural move

Use the supporting documents when you need a narrower contributor view:

- [`documentation-model.md`](./documentation-model.md): maintenance guidance for keeping the shared documentation set small and authoritative
- [`agent-runtime-vision.md`](./agent-runtime-vision.md): forward-looking runtime notes focused on service extraction and multi-channel evolution
- [`agent-runtime-roadmap.md`](./agent-runtime-roadmap.md): phased implementation plan for typed events, policy, tasks, background work, artifacts, and persistence choices

## Decision Records

- [`adrs/README.md`](./adrs/README.md): cross-cutting architecture decisions that shape more than one Meridian repository
- [`kdds/README.md`](./kdds/README.md): cross-cutting trade-off analysis and decision history
- [`kdds/KDD-001-runtime-backend-and-session-model-options.md`](./kdds/KDD-001-runtime-backend-and-session-model-options.md): accepted option analysis for runtime backend, session state, lifecycle, and capability exposure

## Relationship To Repo-Local Docs

This repository does not replace local documentation in the implementation repositories.

Use the local repositories for:

- shipped CLI behaviour in `meridian.cli`
- current web application behaviour and local runtime setup in `meridian.chat`
- sandbox prototype setup and constraints in `meridian.agent-sandbox`
- issuer setup and deployment detail in `meridian.oauth-server`

## Initial Authority Boundaries

For the current documentation set, use these simple rules:

- If the document describes one repository's shipped behaviour or setup, it belongs in that repository.
- If the document explains how multiple repositories fit together, it belongs here.
- If the document describes future direction that affects more than one repository, it belongs here.
- If another document is already authoritative, link to it rather than restating it.

## Planned Expansion

This repository should remain intentionally small.

Useful additions should be driven by real need rather than completeness. The next documents that may become worthwhile are:

- a shared glossary
- a shared authentication and authorisation model
- a shared session and state model
- additional cross-cutting ADRs and KDDs as the system settles
