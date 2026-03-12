import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";

export type Writable = {
	isTTY?: boolean;
	write(chunk: string): void;
};

export type FileSystem = {
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	readFile(path: string, encoding: BufferEncoding): Promise<string>;
	rm(
		path: string,
		options?: { force?: boolean; recursive?: boolean },
	): Promise<void>;
	unlink(path: string): Promise<void>;
	writeFile(path: string, data: string): Promise<void>;
};

export type CliDependencies = {
	env?: NodeJS.ProcessEnv;
	fileSystem?: FileSystem;
	homeDirectory?: string;
	now?: () => Date;
	randomId?: (prefix: string) => string;
	sleep?: (milliseconds: number) => Promise<void>;
	stderr?: Writable;
	stdout?: Writable;
};

export type ResolvedCliDependencies = {
	env: NodeJS.ProcessEnv;
	fileSystem: FileSystem;
	homeDirectory: string;
	now: () => Date;
	randomId: (prefix: string) => string;
	sleep: (milliseconds: number) => Promise<void>;
	stderr: Writable;
	stdout: Writable;
};

export function resolveDependencies(
	dependencies: CliDependencies = {},
): ResolvedCliDependencies {
	return {
		env: dependencies.env ?? process.env,
		fileSystem: dependencies.fileSystem ?? {
			async mkdir(path, options) {
				await mkdir(path, options);
			},
			readFile,
			async rm(path, options) {
				await rm(path, options);
			},
			async unlink(path) {
				await unlink(path);
			},
			async writeFile(path, data) {
				await writeFile(path, data);
			},
		},
		homeDirectory: dependencies.homeDirectory ?? homedir(),
		now: dependencies.now ?? (() => new Date()),
		randomId:
			dependencies.randomId ??
			((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
		sleep:
			dependencies.sleep ??
			((milliseconds) =>
				new Promise((resolve) => {
					setTimeout(resolve, milliseconds);
				})),
		stderr: dependencies.stderr ?? process.stderr,
		stdout: dependencies.stdout ?? process.stdout,
	};
}
