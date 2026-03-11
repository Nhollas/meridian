FROM node:22-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install meridian CLI
ARG GITLAB_PACKAGES_TOKEN
RUN --mount=type=bind,source=.npmrc.docker,target=/tmp/.npmrc \
  GITLAB_PACKAGES_TOKEN="${GITLAB_PACKAGES_TOKEN}" \
  npm install -g --userconfig /tmp/.npmrc @comparethemarket/meridian-cli@latest

# Install app dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy app source
COPY . .

# Build
RUN npm run build

ENV MERIDIAN_BIN=meridian
ENV MERIDIAN_AUTH_CLIENT_ID=meridian-cli
ENV MERIDIAN_AUTH_ISSUER=https://cicd-meridian-oauth-server-shadow.vassily.io/realms/meridian

EXPOSE 3200

CMD ["npm", "start"]
