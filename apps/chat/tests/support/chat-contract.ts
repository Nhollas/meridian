import {
	createRuntimeEventFactory,
	type RuntimeEventEnvelope,
	serializeRuntimeEventEnvelope,
} from "@meridian/contracts/runtime-events";
import { HttpResponse } from "msw";

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

export function createChatAcceptedResponse(turnId: string) {
	return HttpResponse.json({ turnId }, { status: 202 });
}

export function createSSEStreamResponse(events: RuntimeEventEnvelope[]) {
	const encoder = new TextEncoder();

	return new HttpResponse(
		new ReadableStream({
			start(controller) {
				for (const event of events) {
					controller.enqueue(
						encoder.encode(
							`id:${event.id}\ndata:${serializeRuntimeEventEnvelope(event)}\n\n`,
						),
					);
				}
				controller.close();
			},
		}),
		{
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		},
	);
}

export function createControllableSSEStream() {
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	const encoder = new TextEncoder();

	return {
		response: new HttpResponse(
			new ReadableStream({
				start(nextController) {
					controller = nextController;
				},
			}),
			{
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				},
			},
		),
		close() {
			controller?.close();
		},
		emit(event: RuntimeEventEnvelope) {
			if (!controller) {
				throw new Error("SSE stream controller was not initialized");
			}

			controller.enqueue(
				encoder.encode(
					`id:${event.id}\ndata:${serializeRuntimeEventEnvelope(event)}\n\n`,
				),
			);
		},
	};
}
