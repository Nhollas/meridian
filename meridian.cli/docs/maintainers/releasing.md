# Releasing Meridian CLI

Meridian CLI releases are driven by `semantic-release` on `main`. Do not edit the package version in [`package.json`](../../package.json) by hand.

## How Releases Are Calculated

On each pipeline run for `main`, the release job analyses Conventional Commit messages since the last tag.

- `feat:` publishes a new minor version
- `fix:` and `perf:` publish a new patch version
- `!` in the header, or a `BREAKING CHANGE:` footer, publishes a new major version
- `docs:`, `test:`, `refactor:`, `build:`, `ci:`, and `chore:` do not publish a new version

If a release is required, the pipeline will:

1. update `package.json`, `package-lock.json`, and `CHANGELOG.md`
2. create a `chore(release): x.y.z` commit and `vx.y.z` Git tag
3. publish the package to the GitLab npm registry
4. create or update the GitLab Release page from the latest `CHANGELOG.md` entry

## GitLab Requirements

Two GitLab behaviours matter when using `semantic-release`:

- If you use squash merges, the squash commit message on `main` must still be a valid Conventional Commit.
- If you preserve branch commits, the existing commit hooks are sufficient because `semantic-release` reads those commit messages directly.

The package publish uses `CI_JOB_TOKEN`. The release job also needs a project or personal access token in GitLab CI as `GITLAB_RELEASE_TOKEN` so it can push the generated release commit and tag back to the repository.

## Local Dry Run

To preview the next calculated version locally:

```bash
npm run release:dry-run
```

This command does not publish anything. It shows how `semantic-release` would classify the unreleased commits.

## Where To Look After A Release

Published versions are easiest to inspect in GitLab from:

- the package registry, for installable npm versions
- the releases page, for release notes attached to `v*` tags
