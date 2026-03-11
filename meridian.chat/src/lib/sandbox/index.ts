import { createDockerRuntime } from "./docker-runtime";
import type { SandboxRuntime } from "./runtime";

let sandboxRuntime: SandboxRuntime | null = null;

function createSandboxRuntime(): SandboxRuntime {
	const runtime = process.env["SANDBOX_RUNTIME"] ?? "docker";

	switch (runtime) {
		case "docker":
			return createDockerRuntime();
		default:
			throw new Error(`Unsupported sandbox runtime: ${runtime}`);
	}
}

export function getSandboxRuntime(): SandboxRuntime {
	sandboxRuntime ??= createSandboxRuntime();
	return sandboxRuntime;
}
