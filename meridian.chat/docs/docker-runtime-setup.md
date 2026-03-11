# Docker Runtime Setup

## Prerequisites

- Docker Desktop running
- `meridian-chat-sandbox:local` image built
- Netskope CA bundle available at:

```text
$HOME/.config/certs/netskope-ca-combined.pem
```

## 1. Build the sandbox image

```bash
npm run build:sandbox
```

This builds the sandbox image from the local `../meridian.cli` source, so CLI changes can be tested end to end without publishing a new package version first.

## 2. Export the CA bundle

Add this to `~/.zshrc`:

```bash
export NODE_EXTRA_CA_CERTS="$HOME/.config/certs/netskope-ca-combined.pem"
```

Open a new terminal after updating `~/.zshrc`.

## 3. Remove existing sandbox containers

```bash
docker ps -a --format '{{.Names}}' | grep '^meridian-chat-sandbox-' | while read -r name; do
  docker rm -f "$name"
done
```

## 4. Start the app

```bash
SANDBOX_DOCKER_IMAGE=meridian-chat-sandbox:local npm run dev
```

## 5. Verify a sandbox container

```bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep '^meridian-chat-sandbox-' | head -n 1)

docker exec "$CONTAINER" sh -lc '
  env | grep NODE_EXTRA_CA_CERTS
  ls -l /sandbox-extra-ca.pem
'
```

Expected:

- `NODE_EXTRA_CA_CERTS=/sandbox-extra-ca.pem`
- `/sandbox-extra-ca.pem` exists
