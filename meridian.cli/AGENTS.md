# Meridian CLI Agent Guidance

This file exists for repository-specific rules that are not obvious from scanning the codebase.

## Read These First

Before making changes, use the documentation that matches the kind of change you are making:

- [`docs/README.md`](./docs/README.md): documentation index for contributors, maintainers, ADRs, and KDDs
- [`README.md`](./README.md): package installation and first-run usage
- [`docs/cli-reference.md`](./docs/cli-reference.md): authoritative CLI behaviour, command surface, output modes, exit codes, and local state
- [`docs/proof-of-concept.md`](./docs/proof-of-concept.md): why this proof of concept exists and what is in scope
- `meridian.docs/docs/system-overview.md`: primary shared system description, including the current runtime model
- `meridian.docs/docs/agent-runtime-vision.md`: forward-looking runtime direction beyond current shipped behaviour
- [`docs/getting-started.md`](./docs/getting-started.md): contributor onboarding and documentation responsibilities
- [`docs/maintainers/releasing.md`](./docs/maintainers/releasing.md): release process and semantic-release behaviour
- [`docs/adrs/README.md`](./docs/adrs/README.md): accepted architectural decisions that still constrain the current design
- [`docs/kdds/README.md`](./docs/kdds/README.md): major trade-offs and decision history that may not be obvious from the code

Do not treat the proof of concept or runtime vision documents as substitutes for the CLI reference when changing shipped behaviour.

## Documentation Expectations

Documentation is part of the product surface.

- If shipped CLI behaviour changes, update [`docs/cli-reference.md`](./docs/cli-reference.md).
- If installation or first-run usage changes, update [`README.md`](./README.md).
- If the rationale, scope, or design boundaries change, update [`docs/proof-of-concept.md`](./docs/proof-of-concept.md).
- If documents are added, removed, or restructured, update [`docs/README.md`](./docs/README.md).

Prefer documenting stable interfaces and invariants. Avoid adding brittle file inventories or repeating the same command details across multiple documents.

## Release-Aware Commits

This repository uses `semantic-release`, so commit type affects whether the package is released.

- Use `feat:` when the shipped CLI gains user-visible behaviour, a new command, a new option, or a meaningful expansion of an existing flow.
- Use `fix:` when the shipped CLI behaviour changes to correct a bug, error case, output contract, or other user-visible defect.
- Do not use `refactor:`, `chore:`, or `docs:` for changes that alter shipped CLI behaviour. Those types do not trigger a package release.
- If the behaviour change is significant enough to require a release, the commit message MUST say so through the correct Conventional Commit type.

When in doubt, classify the commit by the effect on CLI consumers rather than by the implementation technique used to deliver the change.

If you are still unsure whether a change should be treated as user-visible CLI behaviour, stop and confirm with the engineer before choosing the commit type. Do not assume `refactor:`, `chore:`, or `docs:` when that decision could suppress a required release.

## Git Workflow Constraints

Branches in this repository must use:

`<type>/<short-kebab-description>`

Examples:

- `feat/add-auth`
- `fix/output-format`
- `docs/update-cli-reference`

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <description>
```

The repository hooks enforce:

- `pre-commit`: blocks commits to `main`, validates branch name, and runs lint-staged
- `commit-msg`: validates Conventional Commit format
- `pre-push`: runs lint, typecheck, and the full test suite
