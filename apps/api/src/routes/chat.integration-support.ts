import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import type { CreateAgentRunner } from "@/lib/agent/runner";
import { createAgentService } from "@/lib/agent/service";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import type { SessionStreamRegistry } from "@/lib/session-stream-registry";
import { createChatRoute } from "@/routes/chat";

export function createTestChat({
	createRunner,
	runtime,
}: {
	createRunner: CreateAgentRunner;
	runtime: SandboxRuntime;
}) {
	let turnCount = 0;
	const eventsBySession = new Map<string, RuntimeEventEnvelope[]>();
	const resolversBySession = new Map<string, () => void>();

	const registry: SessionStreamRegistry = {
		register() {},
		unregister() {},
		async writeEvent(sessionId, event) {
			let events = eventsBySession.get(sessionId);
			if (!events) {
				events = [];
				eventsBySession.set(sessionId, events);
			}
			events.push(event);

			if (event.type === "turn.completed" || event.type === "turn.failed") {
				resolversBySession.get(sessionId)?.();
			}
		},
	};

	const POST = createChatRoute({
		createAgentService: ({ runtime }) =>
			createAgentService({ createRunner, runtime }),
		createTurnId: () => `turn-${++turnCount}`,
		getRuntime: () => runtime,
		registry,
	});

	function collectTurnEvents(
		sessionId: string,
	): Promise<RuntimeEventEnvelope[]> {
		eventsBySession.set(sessionId, []);

		return new Promise<RuntimeEventEnvelope[]>((resolve) => {
			resolversBySession.set(sessionId, () => {
				resolve(eventsBySession.get(sessionId) ?? []);
				resolversBySession.delete(sessionId);
			});
		});
	}

	return { POST, collectTurnEvents };
}
