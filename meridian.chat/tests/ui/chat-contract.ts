import { HttpResponse } from "msw";
import {
	createRuntimeEventFactory,
	type RuntimeEventEnvelope,
	serializeRuntimeEventEnvelope,
} from "@/lib/runtime-events/contracts";

const encoder = new TextEncoder();

export function createChatEventFactory({
	sessionId = "session-123",
	turnId = "turn-123",
}: {
	sessionId?: string;
	turnId?: string;
} = {}) {
	let eventId = 0;

	return createRuntimeEventFactory({
		createId: () => `evt-${++eventId}`,
		now: () => "2026-03-10T12:00:00.000Z",
		sessionId,
		turnId,
	});
}

export function createChatStreamResponse(events: RuntimeEventEnvelope[]) {
	return new HttpResponse(
		new ReadableStream({
			start(controller) {
				for (const event of events) {
					controller.enqueue(
						encoder.encode(`${serializeRuntimeEventEnvelope(event)}\n`),
					);
				}
				controller.close();
			},
		}),
		{
			headers: {
				"Content-Type": "application/x-ndjson; charset=utf-8",
			},
		},
	);
}

export function createControllableChatStream() {
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

	return {
		response: new HttpResponse(
			new ReadableStream({
				start(nextController) {
					controller = nextController;
				},
			}),
			{
				headers: {
					"Content-Type": "application/x-ndjson; charset=utf-8",
				},
			},
		),
		close() {
			controller?.close();
		},
		emit(event: RuntimeEventEnvelope) {
			if (!controller) {
				throw new Error("Chat stream controller was not initialized");
			}

			controller.enqueue(
				encoder.encode(`${serializeRuntimeEventEnvelope(event)}\n`),
			);
		},
	};
}
