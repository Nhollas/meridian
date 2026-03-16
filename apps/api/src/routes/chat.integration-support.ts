import type { CreateAgentRunner } from "@/lib/agent/runner";
import { createAgentService } from "@/lib/agent/service";
import type { BackgroundCommandCompleteCallback } from "@/lib/agent/tools";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { createChatRoute } from "@/routes/chat";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";

export function createTestChat({
	createRunner,
	onBackgroundCommandComplete,
	runtime,
}: {
	createRunner: CreateAgentRunner;
	onBackgroundCommandComplete?: BackgroundCommandCompleteCallback;
	runtime: SandboxRuntime;
}) {
	let turnCount = 0;
	const { registry, collectTurnEvents } = createCollectingRegistry();

	const POST = createChatRoute({
		createAgentService: ({ runtime }) =>
			createAgentService({
				createRunner,
				onBackgroundCommandComplete,
				runtime,
			}),
		createTurnId: () => `turn-${++turnCount}`,
		getRuntime: () => runtime,
		onBackgroundCommandComplete,
		registry,
	});

	return { POST, collectTurnEvents, registry };
}
