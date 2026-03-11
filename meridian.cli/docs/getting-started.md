# Getting Started

This guide is for contributors working on `meridian.cli`. It focuses on getting the CLI running locally, understanding the parts of the codebase that usually matter first, and keeping the documentation set easy to maintain.

For the wider documentation map, start from [`README.md`](./README.md) in this `docs/` directory.

## Prerequisites

- Node.js 20 or newer
- npm
- access to the sibling `meridian.oauth-server` repository if you want to run the issuer locally

Install dependencies once:

```bash
npm install
```

## Local Setup

Copy the local environment template:

```bash
cp .env.example .env
```

The `.env.example` file points the CLI at a local Meridian issuer on `http://localhost:8080/realms/meridian`.

If you want to exercise the Device Flow locally, start the issuer from the sibling repository:

```bash
cd ../meridian.oauth-server
docker compose up --build
```

Then return to this package and inspect the CLI surface:

```bash
npm run dev -- --help
npm run dev -- auth status --json
```

## Day-to-Day Commands

Use these commands during normal development:

```bash
npm run dev -- --help
npm test
npm run typecheck
npm run lint
npm run lint:fix
npm run build
```

`npm run dev` loads `.env` automatically and runs the CLI directly through `tsx`, which makes it the usual entry point while iterating on commands.

## Orienting Yourself

The codebase is intentionally small. The most useful way to understand it is by stable concepts rather than by memorising a long file inventory.

- [`src/cli.ts`](../src/cli.ts): the composition root. It assembles the Commander program, registers feature commands, and applies top-level error handling.
- Feature directories under [`src/`](../src): each CLI area owns its command registration and command handlers. `auth`, `products`, `product-schemas`, `proposal-requests`, `proposals`, and `results` follow the same broad shape.
- [`src/catalogue/registry.ts`](../src/catalogue/registry.ts): the built-in Product catalogue and Product Schemas. If the available Product surface changes, this is one of the first places to inspect.
- [`src/store/`](../src/store): the serialised local state for credentials and comparison data.
- [`AGENTS.md`](../AGENTS.md): repository-specific engineering guidance for humans and agents.

If you are changing command behaviour, start from the feature directory and trace back to `src/cli.ts` only when you need to understand global options, output mode selection, or process-level error handling.

## Documentation Responsibilities

This repository treats documentation as part of the product surface. A command change is not complete unless the docs that define or explain that behaviour are still accurate.

When you change the CLI:

- update [`docs/cli-reference.md`](./cli-reference.md) if the command surface, output shape, exit behaviour, or local state contract changed
- update [`README.md`](../README.md) if the package installation or first-run flow changed
- update [`docs/proof-of-concept.md`](./proof-of-concept.md) only when the rationale, goals, or scope changed
- update [`docs/README.md`](./README.md) if documents are added, removed, or moved

This split exists to reduce drift. The reference doc describes what ships. The proof of concept document explains why the work exists. The README helps somebody use the package quickly.

## Writing Documentation That Stays Maintainable

The easiest documentation to maintain usually describes stable interfaces and invariants.

Prefer:

- command syntax, flags, exit codes, state locations, and output shape
- design constraints and terminology that are unlikely to change every refactor
- short examples that can be executed or copied into a shell session

Avoid:

- long file-by-file inventories that become stale after ordinary refactoring
- aspirational language about behaviour the CLI does not yet implement
- repeating the same command details across multiple documents

When a detail is owned by one document, link to that document instead of rephrasing it elsewhere. That pattern is more useful for contributors and easier for agents to keep correct.
