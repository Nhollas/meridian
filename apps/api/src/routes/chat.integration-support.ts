import type { CreateAgentRunner } from "@/lib/agent";
import { createAgentService } from "@/lib/agent";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { createTurnEngine } from "@/lib/turn-engine";
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
	const nextTurnId = () => `turn-${++turnCount}`;
	const { registry, collectTurnEvents } = createCollectingRegistry();

	const engine = createTurnEngine({
		createAgentService: (deps) =>
			createAgentService({
				createRunner,
				onBackgroundCommandComplete: deps.onBackgroundCommandComplete,
				runtime: deps.runtime,
			}),
		createTurnId: nextTurnId,
		getRuntime: () => runtime,
		registry,
	});

	const POST = createChatRoute({
		createTurnId: nextTurnId,
		engine,
	});

	return { POST, collectTurnEvents, registry };
}
