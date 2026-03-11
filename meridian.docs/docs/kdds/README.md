# Key Decision Discovery Documents

This directory records cross-cutting decision exploration for the Meridian system.

KDDs are useful when the option space and trade-offs are likely to matter later, even when the current preferred direction is already known.

## When To Add A Cross-Cutting KDD

Add a KDD here when the document:

- evaluates options that affect more than one repository
- captures trade-offs that future contributors may need to revisit
- explains why a path was deferred rather than rejected permanently
- preserves context that would be too detailed or provisional for an ADR

Keep repository-local KDDs in the repository that owns the implementation.

## Expected Early Topics

The first likely cross-cutting KDDs are:

- sandbox backend option space
- session persistence and lifecycle options
- client and channel adapter model

## Index

- [KDD-001: Runtime Backend And Session Model Options](./KDD-001-runtime-backend-and-session-model-options.md)

## Relationship To Other Docs

- [`../adrs/README.md`](../adrs/README.md): records durable cross-cutting decisions
- [`../documentation-model.md`](../documentation-model.md): explains where KDDs should live
- [`../agent-runtime-vision.md`](../agent-runtime-vision.md): describes the runtime direction that these KDDs help shape
