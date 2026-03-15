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
		throw new Error("SSE response body missing.");
	}

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });

		let offset = 0;
		let blockEnd = buffer.indexOf("\n\n", offset);

		while (blockEnd >= 0) {
			const block = buffer.slice(offset, blockEnd);
			offset = blockEnd + 2;

			for (const line of block.split("\n")) {
				if (line.startsWith("data: ")) {
					const json = line.slice(6);
					onEvent(parseRuntimeEventEnvelope(JSON.parse(json)));
				}
			}

			blockEnd = buffer.indexOf("\n\n", offset);
		}

		buffer = buffer.slice(offset);

		if (done) {
			return;
		}
	}
}
