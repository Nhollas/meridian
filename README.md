# Meridian

Chat UI, API server, and CLI for building and running AI agents with sandboxed code execution.

## How it works

Messages go from the chat UI to the API, which runs a LangGraph agent. The agent runs commands in a Docker sandbox (file ops, background processes, arbitrary code) and streams results back. The CLI adds external capabilities, authenticated via OAuth device flow.

<p align="center">
  <img src="docs/architecture/current.svg" alt="Current architecture" />
</p>

## Production architecture (under review)

Exploring two changes:

- **Multi-client support** — adding WhatsApp, Slack, and other messaging services as clients, not just the chat UI
- **Firecracker microVMs** — swapping Docker for Firecracker to get faster boot times and better isolation

<p align="center">
  <img src="docs/architecture/production.svg" alt="Production architecture" />
</p>

## Getting started

### Prerequisites

- Node.js 24+ (see `.nvmrc`)
- pnpm 9.15.2+
- Docker (for the sandbox and OAuth server)

### Setup

```bash
git clone <repo-url> && cd meridian
pnpm install
pnpm setup          # generate .env files
```

### Running

```bash
pnpm --filter @meridian/api run build:sandbox
docker compose up    # starts OAuth server (port 8080)
pnpm dev             # starts API (port 3201) + Chat (port 3200)
```