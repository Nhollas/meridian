import {
	type RuntimeEventEnvelope,
	serializeRuntimeEventEnvelope,
} from "@meridian/contracts/runtime-events";

export interface SSEWriter {
	writeSSE(message: { data: string; id: string }): Promise<void>;
}

export interface SessionStreamRegistry {
	register(sessionId: string, writer: SSEWriter): void;
	unregister(sessionId: string): void;
	writeEvent(sessionId: string, event: RuntimeEventEnvelope): Promise<void>;
}

export function createSessionStreamRegistry(): SessionStreamRegistry {
	// One writer per session — a new connection for the same session
	// overwrites the previous one. Concurrent tabs are not supported.
	const streams = new Map<string, SSEWriter>();

	return {
		register(sessionId, writer) {
			streams.set(sessionId, writer);
		},

		unregister(sessionId) {
			streams.delete(sessionId);
		},

		async writeEvent(sessionId, event) {
			const writer = streams.get(sessionId);
			if (!writer) {
				return;
			}

			await writer.writeSSE({
				data: serializeRuntimeEventEnvelope(event),
				id: event.id,
			});
		},
	};
}
