# Meridian Chat Documentation

This directory is the internal documentation index for `meridian.chat`.

Use these documents by purpose rather than reading them all in sequence.

Start with [`../README.md`](../README.md) for the repository overview.

## Current Architecture

- `meridian.docs/docs/system-overview.md`: primary shared system document covering the current architecture, repository split, and trust boundaries
- `meridian.docs/docs/agent-runtime-vision.md`: forward-looking runtime notes covering service extraction and multi-channel evolution
- `meridian.docs/docs/kdds/KDD-001-runtime-backend-and-session-model-options.md`: accepted cross-cutting option analysis behind the current runtime direction
- [`agent-reference.md`](./agent-reference.md): authoritative reference for the current `/api/chat` contract, streamed runtime events, session model, and runtime-backed agent behaviour
- [`agent-runtime-behavioral-test-inventory.md`](./agent-runtime-behavioral-test-inventory.md): prioritized inventory of consumer-visible agent/runtime behaviors we want the test suite to cover

## Local Runtime Setup

- [`docker-runtime-setup.md`](./docker-runtime-setup.md): local Docker runtime setup and usage for the current web prototype
- [`testing-agent-runtime.md`](./testing-agent-runtime.md): target testing strategy for the agent and runtime layers
- [`testing-ui.md`](./testing-ui.md): UI testing strategy focused on the `/api/chat` contract and behavior-first component tests

## Relationship To System Documentation

`meridian.chat` owns the current web application architecture and its local runtime integration.

Shared system documents live in `meridian.docs`. In particular:

- the main system overview belongs in `meridian.docs`
- cross-repository runtime direction belongs in `meridian.docs`
- shared glossary, shared auth model, and other cross-cutting architecture documents should also live in that central home

The current shared entry points are:

- `meridian.docs/docs/system-overview.md`
- `meridian.docs/docs/agent-runtime-vision.md`

## How To Maintain This Set

- Update `meridian.docs/docs/system-overview.md` when the shared system story changes.
- Update `meridian.docs/docs/agent-runtime-vision.md` when the forward-looking runtime direction changes.
- Update [`agent-reference.md`](./agent-reference.md) when the `/api/chat` contract or current agent behaviour changes.
- Update [`agent-runtime-behavioral-test-inventory.md`](./agent-runtime-behavioral-test-inventory.md) when confidence goals or expected behaviors change.
- Update [`docker-runtime-setup.md`](./docker-runtime-setup.md) when the local Docker workflow changes.
- Update [`testing-agent-runtime.md`](./testing-agent-runtime.md) when the desired testing shape changes.
- Update [`testing-ui.md`](./testing-ui.md) when the UI testing shape changes.
- Update this index when documents are added, removed, or moved.

Keep one document authoritative for each concern. Prefer links over repeated explanation.
