import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import type { SessionStreamRegistry } from "@/lib/session-stream-registry";

export function createCollectingRegistry() {
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

	return { registry, collectTurnEvents };
}
