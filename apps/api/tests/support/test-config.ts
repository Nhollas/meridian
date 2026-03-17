import type { SandboxConfig } from "@/lib/sandbox/config";

export function createTestConfig(
	overrides: Partial<SandboxConfig> = {},
): SandboxConfig {
	return {
		dockerBinary: "docker",
		extraCaCertsFile: undefined,
		instructionsFile: "",
		meridianAuthClientId: "meridian-cli",
		meridianAuthIssuer: "http://host.docker.internal:8080/realms/meridian",
		proxyEnv: {},
		rootDirectory: "/tmp/meridian-chat-sandbox-sessions",
		runtime: "docker",
		sandboxImage: "meridian-chat-sandbox:local",
		sessionTtlMs: 5 * 60 * 1000,
		...overrides,
	};
}
