import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";

export function createChatRequest(
	body: {
		message: string;
		sessionId: string;
		turnId?: string;
	},
	options?: {
		headers?: Record<string, string>;
	},
) {
	return new Request("http://localhost/api/chat", {
		body: JSON.stringify({
			message: body.message,
			...(body.turnId ? { turnId: body.turnId } : {}),
		}),
		headers: {
			"Content-Type": "application/json",
			"session-id": body.sessionId,
			...(options?.headers ?? {}),
		},
		method: "POST",
	});
}

export function getCompletedToolOutput(
	events: RuntimeEventEnvelope[],
	name: string,
) {
	const event = events.find(
		(candidate) =>
			candidate.type === "tool.completed" &&
			candidate.payload.toolCall.name === name,
	);

	if (!event || event.type !== "tool.completed") {
		throw new Error(`Tool ${name} was not completed`);
	}

	return event.payload.toolCall.output;
}

export function getParsedToolOutput(
	events: RuntimeEventEnvelope[],
	name: string,
) {
	return JSON.parse(getCompletedToolOutput(events, name));
}
