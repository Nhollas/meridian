import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempHome() {
	const homeDirectory = await mkdtemp(join(tmpdir(), "meridian-cli-"));

	return {
		homeDirectory,
		async cleanup() {
			await rm(homeDirectory, { force: true, recursive: true });
		},
		async writeMeridianFile(fileName: string, contents: unknown) {
			const directory = join(homeDirectory, ".meridian");
			await mkdir(directory, { recursive: true });
			await writeFile(
				join(directory, fileName),
				JSON.stringify(contents, null, 2),
			);
		},
	};
}
