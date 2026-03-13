import {
	parseRuntimeEventEnvelope,
	type RuntimeEventEnvelope,
} from "@meridian/contracts/runtime-events";

export async function readChatStream(
	response: Response,
	onEvent: (event: RuntimeEventEnvelope) => void,
) {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("Streaming response body missing.");
	}

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });

		let offset = 0;
		let newlineIndex = buffer.indexOf("\n", offset);
		while (newlineIndex >= 0) {
			const line = buffer.slice(offset, newlineIndex).trim();
			offset = newlineIndex + 1;

			if (line) {
				onEvent(parseRuntimeEventEnvelope(JSON.parse(line)));
			}

			newlineIndex = buffer.indexOf("\n", offset);
		}

		buffer = buffer.slice(offset);

		if (done) {
			const remaining = buffer.trim();
			if (remaining) {
				onEvent(parseRuntimeEventEnvelope(JSON.parse(remaining)));
			}
			return;
		}
	}
}
