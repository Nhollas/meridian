import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROXY_ENV_VARS } from "./runtime-shared";

const DEFAULT_DOCKER_IMAGE = "meridian-chat-sandbox:local";
const DEFAULT_MERIDIAN_AUTH_CLIENT_ID = "meridian-cli";
const DEFAULT_MERIDIAN_AUTH_ISSUER =
	"http://host.docker.internal:8080/realms/meridian";
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;

export type SandboxConfig = {
	dockerBinary: string;
	extraCaCertsFile: string | undefined;
	instructionsFile: string;
	meridianAuthClientId: string;
	meridianAuthIssuer: string;
	proxyEnv: Record<string, string>;
	rootDirectory: string;
	runtime: string;
	sandboxImage: string;
	sessionTtlMs: number;
};

export function getSandboxConfig(
	env: NodeJS.ProcessEnv = process.env,
): SandboxConfig {
	const proxyEnv: Record<string, string> = {};
	for (const name of PROXY_ENV_VARS) {
		const value = env[name];
		if (value) {
			proxyEnv[name] = value;
		}
	}

	return {
		dockerBinary: env["SANDBOX_DOCKER_BIN"] ?? "docker",
		extraCaCertsFile:
			env["SANDBOX_EXTRA_CA_CERTS_FILE"] ?? env["NODE_EXTRA_CA_CERTS"],
		instructionsFile: env["SANDBOX_INSTRUCTIONS_FILE"] ?? "",
		meridianAuthClientId:
			env["MERIDIAN_AUTH_CLIENT_ID"] ?? DEFAULT_MERIDIAN_AUTH_CLIENT_ID,
		meridianAuthIssuer:
			env["MERIDIAN_AUTH_ISSUER"] ?? DEFAULT_MERIDIAN_AUTH_ISSUER,
		proxyEnv,
		rootDirectory:
			env["SANDBOX_STATE_DIR"] ??
			join(tmpdir(), "meridian-chat-sandbox-sessions"),
		runtime: env["SANDBOX_RUNTIME"] ?? "docker",
		sandboxImage: env["SANDBOX_DOCKER_IMAGE"] ?? DEFAULT_DOCKER_IMAGE,
		sessionTtlMs: parseSessionTtlMs(env["SANDBOX_SESSION_TTL_MS"]),
	};
}

function parseSessionTtlMs(raw: string | undefined): number {
	if (!raw) {
		return DEFAULT_SESSION_TTL_MS;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_SESSION_TTL_MS;
	}

	return parsed;
}
