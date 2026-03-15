import {
	parseRuntimeEventEnvelope,
	type RuntimeEventEnvelope,
} from "@meridian/contracts/runtime-events";

export async function readSSEStream(
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

		let blockEnd = buffer.indexOf("\n\n");
		while (blockEnd >= 0) {
			const block = buffer.slice(0, blockEnd);
			buffer = buffer.slice(blockEnd + 2);

			const data = parseSSEBlock(block);
			if (data !== null) {
				onEvent(parseRuntimeEventEnvelope(JSON.parse(data)));
			}

			blockEnd = buffer.indexOf("\n\n");
		}

		if (done) {
			const remaining = buffer.trim();
			if (remaining) {
				const data = parseSSEBlock(remaining);
				if (data !== null) {
					onEvent(parseRuntimeEventEnvelope(JSON.parse(data)));
				}
			}
			return;
		}
	}
}

function parseSSEBlock(block: string): string | null {
	for (const line of block.split("\n")) {
		if (line.startsWith("data:")) {
			return line.slice(5).trim();
		}
	}
	return null;
}
