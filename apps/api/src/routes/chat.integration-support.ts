import type { CreateAgentRunner } from "@/lib/agent/runner";
import { createAgentService } from "@/lib/agent/service";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { createChatRoute } from "@/routes/chat";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";

export function createTestChat({
	createRunner,
	runtime,
}: {
	createRunner: CreateAgentRunner;
	runtime: SandboxRuntime;
}) {
	let turnCount = 0;
	const { registry, collectTurnEvents } = createCollectingRegistry();

	const POST = createChatRoute({
		createAgentService: ({ runtime }) =>
			createAgentService({ createRunner, runtime }),
		createTurnId: () => `turn-${++turnCount}`,
		getRuntime: () => runtime,
		registry,
	});

	return { POST, collectTurnEvents };
}
