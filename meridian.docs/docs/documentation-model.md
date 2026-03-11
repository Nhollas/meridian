# Meridian Documentation Model

## Purpose

This document explains how to keep the Meridian documentation set coherent across repositories.

The immediate problem is not a lack of documentation. The harder problem is that a small system can start to feel larger than it is when the same ideas are described from several repository perspectives at once. The aim of this model is to keep one document authoritative for each concern, while still leaving enough context in each repository for day-to-day work.

## Why `meridian.docs` Exists

The Meridian workspace is split across multiple Git repositories:

- `meridian.cli`
- `meridian.chat`
- `meridian.agent-sandbox`
- `meridian.oauth-server`

There is no parent Git repository for the workspace itself. A local top-level `docs/` directory would therefore be convenient for drafting, but it would not be a shared or versioned documentation home.

`meridian.docs` exists to give cross-repo documents a canonical home without forcing one implementation repository to act as the system-level documentation owner.

## Scope

### What belongs in `meridian.docs`

Use `meridian.docs` for:

- the primary shared system overview
- repository ownership and boundaries
- shared concepts and terminology
- future direction that extends beyond one repository
- cross-cutting ADRs and KDDs when they are genuinely needed

### What does not belong in `meridian.docs`

Do not use `meridian.docs` for:

- authoritative CLI command reference
- local development setup for a single repository
- repo-specific runbooks
- low-level implementation detail that must stay tightly aligned with code in one repository

Those documents should remain in the repository that owns the code.

## Authority Model

Contributors should be able to answer these questions without reading the whole corpus:

- Where is the current shared system shape described?
- Where is repo-local behaviour described?
- Where is future direction described?
- Where do durable decisions live?
- Where does trade-off history live?

To support that, the documentation set should keep these categories distinct:

- current shipped or implemented behaviour
- current system shape
- future direction
- durable decisions
- decision history

For Meridian, the practical outcome is simple:

- [`system-overview.md`](./system-overview.md) is the primary cross-repository document
- repo-local setup and behaviour stay with the repository that owns the code
- ADRs and KDDs stay rare and should be written only when the decision has enough weight to justify the maintenance cost

## Repository Responsibilities

The detailed repository split is described in [`system-overview.md`](./system-overview.md). This document focuses on placement rules rather than restating the system description in full.

In broad terms:

- `meridian.cli` owns the CLI command surface, local setup, and CLI-specific rationale
- `meridian.chat` owns the web experience and its local runtime integration detail
- `meridian.agent-sandbox` owns the narrow prototype setup needed to reproduce the sandbox experiment
- `meridian.oauth-server` owns issuer setup, deployment, and operational detail
- `meridian.docs` owns the shared system explanation and a small amount of cross-cutting design context

## Document Placement Rules

Put a document in the owning repository when:

- it describes current behaviour in that repository
- it must change whenever that repository's code changes
- it is a setup guide, runbook, or maintainer guide for that repository
- it explains a repository-local architectural decision

Put a document in `meridian.docs` when:

- it describes how two or more repositories fit together
- it defines terms used across repositories
- it explains a shared runtime or system model
- it captures future direction beyond one implementation repository
- it records a decision that constrains multiple repositories

## Document Placement Examples

| Current document | Recommendation | Reason |
| --- | --- | --- |
| `meridian.chat` implementation notes for `DockerRuntime` | Keep in `meridian.chat` | They are tightly aligned with the current code and local workflow. |
| current system narrative spanning CLI, chat, runtime, and issuer | `docs/system-overview.md` | The explanation is only useful if it stays cross-repository and authoritative in one place. |
| future runtime extraction notes that affect several repositories | `docs/agent-runtime-vision.md` | The design questions extend beyond the web application that currently hosts the runtime. |
| cross-repo runtime trade-off analysis | `docs/kdds/KDD-001-runtime-backend-and-session-model-options.md` | The option analysis affects more than one repository and should not be buried in one implementation repo. |
| `meridian.chat/docs/docker-runtime-setup.md` | Keep in `meridian.chat` | It is local implementation and setup detail. |
| `meridian.cli/docs/cli-reference.md` | Keep in `meridian.cli` | It is authoritative shipped CLI behaviour. |
| `meridian.cli/docs/proof-of-concept.md` | Keep in `meridian.cli` | It explains the CLI proof of concept and its scope. |
| `meridian.agent-sandbox/README.md` | Keep in `meridian.agent-sandbox` and clarify role | It should explain the prototype without becoming the system architecture home. |
| `meridian.oauth-server/README.md` | Keep in `meridian.oauth-server` | It is repo-local introduction and setup material. |

## First Iteration Priorities

The first useful version of `meridian.docs` does not need to be large.

The minimum worthwhile set is:

- `README.md`
- `docs/README.md`
- `docs/system-overview.md`
- `docs/documentation-model.md`
- `docs/agent-runtime-vision.md`
- `docs/kdds/README.md`

After that, useful additions include:

- shared glossary
- shared authentication and authorisation model
- shared session and state model
- cross-cutting ADRs

## Maintenance Rule

When a new document is added, its scope should be explicit.

If the document starts accumulating phrases such as “across the Meridian repositories”, “the system as a whole”, or “future clients and channels”, it is probably a candidate for `meridian.docs`.

If a new document begins by restating material that already exists in [`system-overview.md`](./system-overview.md), that is usually a sign that the document should be narrowed or replaced with a link.
