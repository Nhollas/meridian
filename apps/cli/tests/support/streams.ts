export function createWritable(isTTY = true) {
	const chunks: string[] = [];

	return {
		stream: {
			isTTY,
			write(chunk: string) {
				chunks.push(chunk);
			},
		},
		output() {
			return chunks.join("");
		},
	};
}
