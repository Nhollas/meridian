import { parseRuntimeEventEnvelope } from "@meridian/contracts/runtime-events";

export function createChatRequest(
	body: {
		message: string;
		sessionId: string;
	},
	options?: {
		headers?: Record<string, string>;
	},
) {
	return new Request("http://localhost/api/chat", {
		body: JSON.stringify({ message: body.message }),
		headers: {
			"Content-Type": "application/json",
			"session-id": body.sessionId,
			...(options?.headers ?? {}),
		},
		method: "POST",
	});
}

export async function readRuntimeEvents(response: Response) {
	const body = await response.text();
	return body
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => parseRuntimeEventEnvelope(JSON.parse(line)));
}

export function getCompletedToolOutput(
	events: Awaited<ReturnType<typeof readRuntimeEvents>>,
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
	events: Awaited<ReturnType<typeof readRuntimeEvents>>,
	name: string,
) {
	return JSON.parse(getCompletedToolOutput(events, name));
}
