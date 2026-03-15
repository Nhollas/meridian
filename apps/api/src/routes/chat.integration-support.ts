import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import type { CreateAgentRunner } from "@/lib/agent/runner";
import { createAgentService } from "@/lib/agent/service";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import type { SessionEventBus } from "@/lib/session-event-bus";
import { createSessionEventBus } from "@/lib/session-event-bus";
import { createChatRoute } from "@/routes/chat";

export function createTestChat({
	createRunner,
	runtime,
}: {
	createRunner: CreateAgentRunner;
	runtime: SandboxRuntime;
}) {
	let turnCount = 0;
	const eventBus = createSessionEventBus();

	const POST = createChatRoute({
		createAgentService: ({ runtime }) =>
			createAgentService({ createRunner, runtime }),
		createTurnId: () => `turn-${++turnCount}`,
		getRuntime: () => runtime,
		eventBus,
	});

	return { POST, eventBus };
}

export async function collectTurnEvents(
	eventBus: SessionEventBus,
	sessionId: string,
): Promise<RuntimeEventEnvelope[]> {
	const stream = eventBus.subscribe(sessionId);
	const reader = stream.getReader();
	const events: RuntimeEventEnvelope[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		events.push(value);
		if (value.type === "turn.completed" || value.type === "turn.failed") {
			break;
		}
	}

	reader.releaseLock();
	return events;
}
