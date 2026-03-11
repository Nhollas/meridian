# Architecture Decision Records

This directory records architecture decisions that shape more than one Meridian repository.

Use these ADRs when a decision needs to remain discoverable because future contributors are likely to ask why the system is structured this way across repository boundaries.

## When To Add A Cross-Cutting ADR

Add an ADR here when the decision:

- constrains more than one repository
- changes how repositories interact
- establishes a shared architectural boundary
- is likely to matter again when the system evolves

Keep repository-local ADRs in the repository that owns the implementation.

## Expected Early Topics

The first likely cross-cutting ADRs are:

- runtime abstraction as a required boundary between orchestration and execution
- discovery-first or hybrid runtime capability exposure
- device-flow-based authorisation as the user trust boundary for agent-driven execution

## Relationship To Other Docs

- [`../system-overview.md`](../system-overview.md): explains the shared system shape
- [`../agent-runtime-vision.md`](../agent-runtime-vision.md): explains the forward-looking runtime direction
- [`../kdds/README.md`](../kdds/README.md): records the trade-off analysis that may lead to these ADRs
