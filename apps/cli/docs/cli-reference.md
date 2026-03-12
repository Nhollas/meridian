# Meridian CLI Reference

This document is the authoritative reference for the shipped Meridian CLI. It describes the current command surface, output behaviour, local state, and configuration. It should track what the binary does today.

For the proof of concept rationale and design choices, see [`proof-of-concept.md`](./proof-of-concept.md).

## Scope

The current CLI supports:

- authentication against Meridian's OAuth issuer using the OAuth 2.1 Device Flow
- product discovery and Product Schema retrieval
- creation of Proposal Requests from JSON input files
- creation of Proposals backed by mock comparison data
- retrieval of Results for stored Proposals

The comparison journey commands are still backed by mock data. They demonstrate the command and data model rather than a production backend integration.

## Defined Terms

These terms are used throughout the CLI and retain their domain meaning:

| Term | Description |
| --- | --- |
| **Proposal Request** | An optional, mutable resource where product data can be persisted ahead of time. It acts as a draft containing the details a user would normally enter on the website. |
| **Proposal** | The immutable "go compare" event. Creating a Proposal starts the comparison process. In the current proof of concept, the CLI produces mock comparison data immediately. |
| **Result** | The collection of provider responses for a given Proposal. This is the data set that would back a results page. |
| **Product** | A product vertical available for comparison, such as broadband or travel insurance. Each Product has one or more supported versions. |
| **Product Schema** | The JSON schema for a given Product and version. It defines the input required to create a Proposal Request. |
| **Device Flow** | An OAuth 2.1 authorisation grant for devices or runtimes without a browser. The CLI displays a verification URL and user code while the user completes sign-in elsewhere. |

## Common Behaviour

### Output Modes

All current data-producing commands support `--json`.

- When `--json` is passed, the command writes JSON to stdout.
- When stdout is not a TTY, JSON becomes the default for commands that support both human and JSON output.
- Human-readable output goes to stdout.
- Errors go to stderr.

`meridian auth login --json` is slightly different from the other commands. It emits newline-delimited JSON events so that a caller can react while the Device Flow is in progress.

`meridian product-schemas get` also accepts `--json` for consistency, but its success output is always JSON even when the flag is omitted.

### Exit Codes

The CLI currently uses these exit codes:

- `0`: success
- `1`: runtime, validation, authentication, or state errors
- `2`: usage errors such as unknown commands, unknown options, or missing option values

### Local State

The CLI stores local state beneath `~/.meridian/`:

- `~/.meridian/credentials.json`: stored access token, refresh token, ID token, expiry, and user identifier
- `~/.meridian/data.json`: locally stored Proposal Requests, Proposals, and Results

The auth and comparison commands treat these files as implementation state. They can be deleted to reset local state. If the stored JSON becomes invalid, the CLI reports a structured error rather than crashing.

### Authentication Configuration

The CLI reads its issuer configuration from the environment. If these variables are not set, the shared non-production issuer is used.

| Environment Variable | Description | Default |
| --- | --- | --- |
| `MERIDIAN_AUTH_ISSUER` | Keycloak realm URL | `http://localhost:8080/realms/meridian` |
| `MERIDIAN_AUTH_CLIENT_ID` | OAuth client ID | `meridian-cli` |

For local development, copy `.env.example` to `.env` and run the CLI via `npm run dev`.

## Top-Level Commands

### `meridian --help`

Prints the command summary and global options.

```bash
meridian -h
meridian --help
```

### `meridian --version`

Prints the installed CLI version.

```bash
meridian -V
meridian --version
```

## `auth`

Authentication commands manage the local session used by the comparison journey commands.

### `meridian auth login`

Starts the OAuth 2.1 Device Flow against the configured issuer.

```bash
meridian auth login
meridian auth login --json
```

Options:

- `--json`: emit newline-delimited JSON events instead of human-readable progress output

Behaviour:

- Requests a device authorisation from the issuer
- Prints the verification URL and user code
- Polls the token endpoint until the user completes sign-in in a browser
- Stores the resulting tokens in `~/.meridian/credentials.json`

Human-readable output:

- prints the verification URL and user code
- prints `Waiting for authentication...`
- prints `done` when the browser flow completes
- prints the authenticated user and credential path

JSON output:

- first line: a `pending` event containing `verification_uri_complete`, `user_code`, and `interval_seconds`
- second line: an `authenticated` event containing the same verification details plus `interval_seconds`, `user`, and `expires_at`

Example JSON events:

```json
{"interval_seconds":5,"verification_uri_complete":"https://keycloak.example.com/realms/meridian/device?user_code=ABCD-1234","user_code":"ABCD-1234","status":"pending"}
{"interval_seconds":5,"verification_uri_complete":"https://keycloak.example.com/realms/meridian/device?user_code=ABCD-1234","user_code":"ABCD-1234","status":"authenticated","user":"john.doe@example.com","expires_at":"2026-03-07T16:20:00.000Z"}
```

### `meridian auth status`

Reports the current authentication state.

```bash
meridian auth status
meridian auth status --json
```

Options:

- `--json`: emit a JSON payload instead of human-readable output

Behaviour:

- reads stored credentials from `~/.meridian/credentials.json`
- refreshes the access token if it has expired and a refresh token is available
- reports the authenticated user and expiry if a valid session exists

Human-readable output:

- authenticated session: `Authenticated`, followed by the user and expiry timestamp
- no session: `Not authenticated`

JSON output:

```json
{
  "authenticated": true,
  "user": "john.doe@example.com",
  "expires_at": "2026-03-07T16:20:00.000Z"
}
```

If no valid session exists, the JSON payload is:

```json
{
  "authenticated": false
}
```

### `meridian auth logout`

Removes the local credential state.

```bash
meridian auth logout
meridian auth logout --json
```

Options:

- `--json`: emit a JSON payload instead of human-readable output

Behaviour:

- reads the stored credentials if present
- attempts remote session revocation when a non-expired session with a refresh token exists
- deletes `~/.meridian/credentials.json`
- succeeds even if local credentials are missing

Human-readable output:

```text
Logged out
```

JSON output:

```json
{
  "logged_out": true
}
```

## `products`

### `meridian products list`

Lists the available Products and their supported versions.

```bash
meridian products list
meridian products list --json
```

Options:

- `--json`: emit a structured product catalogue

Behaviour:

- returns the Product catalogue built into the CLI
- does not require authentication

JSON output example:

```json
{
  "products": [
    {
      "name": "broadband",
      "description": "Compare broadband deals by speed, price, and contract length",
      "versions": [
        {
          "version": "1.0",
          "status": "current"
        }
      ]
    },
    {
      "name": "travel",
      "description": "Compare travel insurance policies by destination, cover level, and trip type",
      "versions": [
        {
          "version": "1.0",
          "status": "current"
        }
      ]
    }
  ]
}
```

Human-readable output presents the same catalogue as a formatted list.

## `product-schemas`

### `meridian product-schemas get`

Returns the JSON schema for a Product and version.

```bash
meridian product-schemas get --product=broadband --version=1.0
meridian product-schemas get --product=broadband --version=1.0 --json
```

Options:

- `--product <product>`: Product name
- `--version <version>`: schema version

Behaviour:

- resolves the Product Schema from the built-in catalogue
- writes the resulting JSON schema document to stdout
- does not require authentication

Current output behaviour:

- success output is always JSON
- `--json` is accepted for consistency with the rest of the CLI
- when `--json` is passed, or when stdout is not a TTY, errors are written as structured JSON on stderr

Example:

```bash
meridian product-schemas get --product=travel --version=1.0
```

If the requested version does not exist, the CLI reports an error and, when the Product is known, includes the available versions on stderr.

## `proposal-requests`

### `meridian proposal-requests create`

Creates a Proposal Request from a JSON input file.

```bash
meridian proposal-requests create --product=broadband --version=1.0 --file=/tmp/broadband.json
meridian proposal-requests create --product=broadband --version=1.0 --file=/tmp/broadband.json --json
```

Options:

- `--product <product>`: Product name
- `--version <version>`: schema version
- `--file <path>`: path to the Proposal Request input JSON file
- `--json`: emit a structured response instead of human-readable output

Behaviour:

- requires a valid authenticated session
- reads and parses the input JSON file
- validates the payload against the Product Schema for the supplied Product and version
- writes the Proposal Request to `~/.meridian/data.json`
- returns a generated Proposal Request identifier with status `draft`

Expected input shape:

```json
{
  "emailAddress": "meridian-dev@example.com",
  "data": {
    "postcode": "AA1 1AA"
  }
}
```

JSON success output:

```json
{
  "id": "pr-a1b2c3d4",
  "product": "broadband",
  "version": "1.0",
  "status": "draft",
  "created_at": "2026-03-07T16:20:00.000Z"
}
```

Validation failures return exit code `1`. In JSON mode, the error payload includes an `issues` array describing the validation problems.

## `proposals`

### `meridian proposals create`

Creates a Proposal from an existing Proposal Request.

```bash
meridian proposals create --proposal-request=pr-a1b2c3d4
meridian proposals create --proposal-request=pr-a1b2c3d4 --json
```

Options:

- `--proposal-request <id>`: Proposal Request identifier
- `--json`: emit a structured response instead of human-readable output

Behaviour:

- requires a valid authenticated session
- loads the referenced Proposal Request from `~/.meridian/data.json`
- creates a Proposal with status `completed`
- generates mock Result data immediately and stores it under the new Proposal identifier

JSON success output:

```json
{
  "id": "prop-x7y8z9ab",
  "proposal_request": "pr-a1b2c3d4",
  "product": "broadband",
  "version": "1.0",
  "status": "completed",
  "created_at": "2026-03-07T16:25:00.000Z"
}
```

If the Proposal Request does not exist, the CLI returns exit code `1` and reports the missing identifier on stderr.

## `results`

### `meridian results get`

Returns the stored Result for a Proposal.

```bash
meridian results get --proposal=prop-x7y8z9ab
meridian results get --proposal=prop-x7y8z9ab --json
```

Options:

- `--proposal <id>`: Proposal identifier
- `--json`: emit the full Result as JSON

Behaviour:

- requires a valid authenticated session
- loads the Proposal and Result from `~/.meridian/data.json`
- sorts offerings so the cheapest available option is shown first

JSON output:

- returns the full stored Result entity
- includes `offerings[]` with provider, pricing, and product-specific metadata

Human-readable output:

- presents the same Result as a table
- formats columns according to the Product being viewed

If the Proposal or Result cannot be found, the CLI returns exit code `1` and reports the missing identifier on stderr.

## End-to-End Example

For a local demo against the sibling OAuth server:

```bash
cp .env.example .env
npm install
npm run dev -- auth login --json
```

After sign-in completes, run:

```bash
npm run dev -- products list --json
npm run dev -- product-schemas get --product=broadband --version=1.0
npm run dev -- proposal-requests create --product=broadband --version=1.0 --file=/tmp/broadband.json --json
npm run dev -- proposals create --proposal-request=pr-a1b2c3d4 --json
npm run dev -- results get --proposal=prop-x7y8z9ab --json
```

Use the Proposal Request example shown in the `proposal-requests create` section when creating the local input file for that flow.
