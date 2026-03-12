import { createDockerRuntime } from "./docker-runtime";
import type { SandboxRuntime } from "./runtime";

let sandboxRuntime: SandboxRuntime | null = null;

function createSandboxRuntime(): SandboxRuntime {
	const runtime = process.env["SANDBOX_RUNTIME"] ?? "docker";
	const instructionsFile = process.env["SANDBOX_INSTRUCTIONS_FILE"];

	if (!instructionsFile) {
		throw new Error(
			"SANDBOX_INSTRUCTIONS_FILE environment variable is required",
		);
	}

	switch (runtime) {
		case "docker":
			return createDockerRuntime(instructionsFile);
		default:
			throw new Error(`Unsupported sandbox runtime: ${runtime}`);
	}
}

export function getSandboxRuntime(): SandboxRuntime {
	sandboxRuntime ??= createSandboxRuntime();
	return sandboxRuntime;
}
