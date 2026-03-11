# Meridian CLI

Meridian CLI brings Compare the Market's comparison capabilities to the command line. It supports authentication, product discovery, Proposal Requests, Proposals, and Results.

The package is published to GitLab as `@comparethemarket/meridian-cli` and installs the `meridian` command.

## Install from GitLab

Configure npm once to resolve `@comparethemarket` packages from GitLab's npm registry:

```bash
npm config set @comparethemarket:registry https://gitlab.com/api/v4/packages/npm/
npm config set -- //gitlab.com/api/v4/packages/npm/:_authToken '${GITLAB_PACKAGES_TOKEN}'
```

This expects `GITLAB_PACKAGES_TOKEN` to be exported in your shell environment.

Then install and run the CLI globally:

```bash
npm install -g @comparethemarket/meridian-cli
meridian --help
```

Use a GitLab token that can read the package registry. For a personal access token, GitLab currently requires the `api` scope.

Authentication works out of the box against Meridian's shared non-production issuer. Local development can override the auth settings with environment variables.

## Quick Start

Authenticate and inspect the available products:

```bash
meridian auth login
meridian products list --json
meridian product-schemas get --product=broadband --version=1.0
```

The comparison journey commands in the current proof of concept use mock comparison data. Authentication uses a real OAuth issuer.

## Configuration

The CLI reads its auth configuration from the environment.

| Environment Variable | Description | Default |
| --- | --- | --- |
| `MERIDIAN_AUTH_ISSUER` | Keycloak realm URL | `https://cicd-meridian-oauth-server-shadow.vassily.io/realms/meridian` |
| `MERIDIAN_AUTH_CLIENT_ID` | OAuth client ID | `meridian-cli` |

For local development against a local issuer, set:

```bash
export MERIDIAN_AUTH_ISSUER=http://localhost:8080/realms/meridian
export MERIDIAN_AUTH_CLIENT_ID=meridian-cli
```

Repository documentation for contributors, maintainers, and architecture decisions lives in the source repository under `docs/`.
