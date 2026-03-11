# Meridian CLI Documentation

This directory is the internal documentation index for `meridian.cli`.

Use these documents by purpose rather than reading them all in sequence.

## Product And Behaviour

- [`cli-reference.md`](./cli-reference.md): authoritative CLI behaviour, command surface, output modes, exit codes, local state, and examples
- [`proof-of-concept.md`](./proof-of-concept.md): why the proof of concept exists, what is in scope, and what remains intentionally deferred

## Related System Docs

- `meridian.docs/docs/system-overview.md`: primary shared system description, including the current runtime shape
- `meridian.docs/docs/agent-runtime-vision.md`: forward-looking runtime direction beyond the current implementation

## Contributor Onboarding

- [`getting-started.md`](./getting-started.md): local setup, day-to-day commands, and documentation responsibilities
- [`../AGENTS.md`](../AGENTS.md): repository-specific guidance for agents and contributors, including release-aware commit rules

## Maintainers

- [`maintainers/releasing.md`](./maintainers/releasing.md): release process and semantic-release behaviour

## Decision Records

- [`adrs/README.md`](./adrs/README.md): architecture decision records that still constrain the current design
- [`kdds/README.md`](./kdds/README.md): major trade-offs and decision history that are useful to retain

## How To Maintain This Set

- Update [`cli-reference.md`](./cli-reference.md) when shipped CLI behaviour changes.
- Update [`proof-of-concept.md`](./proof-of-concept.md) when the rationale, goals, or scope change.
- Keep cross-repo runtime architecture in `meridian.docs`.
- Update this index when documents are added, removed, or moved.

Keep one document authoritative for each concern. Prefer links over repeated explanation.
