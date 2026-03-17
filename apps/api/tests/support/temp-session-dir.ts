import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function createTempSessionDir() {
	const rootDirectory = await mkdtemp(join(tmpdir(), "meridian-api-sandbox-"));

	return {
		rootDirectory,
		async [Symbol.asyncDispose]() {
			await rm(rootDirectory, { force: true, recursive: true });
		},
		async writeSessionFile(
			sessionId: string,
			relativePath: string,
			contents: string,
		) {
			const filePath = join(rootDirectory, sessionId, relativePath);
			await mkdir(dirname(filePath), { recursive: true });
			await writeFile(filePath, contents);
		},
	};
}
