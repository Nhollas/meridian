import { getSandboxConfig } from "./config";
import { createDockerRuntime } from "./docker-runtime";
import type { SandboxRuntime } from "./runtime";

let sandboxRuntime: SandboxRuntime | null = null;

function createSandboxRuntime(): SandboxRuntime {
	const config = getSandboxConfig();

	if (!config.instructionsFile) {
		throw new Error(
			"SANDBOX_INSTRUCTIONS_FILE environment variable is required",
		);
	}

	switch (config.runtime) {
		case "docker":
			return createDockerRuntime(config);
		default:
			throw new Error(`Unsupported sandbox runtime: ${config.runtime}`);
	}
}

export function getSandboxRuntime(): SandboxRuntime {
	sandboxRuntime ??= createSandboxRuntime();
	return sandboxRuntime;
}
