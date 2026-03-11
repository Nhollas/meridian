import { parseRuntimeEventEnvelope } from "@/lib/runtime-events/contracts";

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
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
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
