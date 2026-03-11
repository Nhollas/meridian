# Architecture Decision Records

This directory records architectural decisions that actively shape the current Meridian CLI.

ADRs are for durable decisions that future contributors and agents are likely to revisit with the question, "Why is it like this?" They are not intended to duplicate the CLI reference or general project documentation.

## Index

- [ADR-001: CLI-First Interface for Agent Consumption](./ADR-001-cli-first-interface-for-agent-consumption.md)
- [ADR-002: OAuth Device Flow via Keycloak for User Authorisation](./ADR-002-oauth-device-flow-via-keycloak-for-user-authorisation.md)
- [ADR-003: Structured CLI Output with Human Fallback](./ADR-003-structured-cli-output-with-human-fallback.md)
- [ADR-004: Proof-of-Concept Stand-ins for Unavailable Process APIs](./ADR-004-proof-of-concept-stand-ins-for-unavailable-process-apis.md)

## Relationship to Other Docs

- [`../cli-reference.md`](../cli-reference.md) describes the shipped command surface and behaviour.
- [`../proof-of-concept.md`](../proof-of-concept.md) explains the overall scope and rationale for the proof of concept.
- `meridian.docs/docs/system-overview.md` describes the current shared system shape and runtime model.
- `meridian.docs/docs/agent-runtime-vision.md` describes the forward-looking runtime direction beyond the current CLI.

If a change alters current CLI behaviour, update the CLI reference first. Add or amend an ADR only when the change reflects an architectural decision that should remain discoverable later.
