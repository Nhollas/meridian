import { type ChildProcess, execFile, spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import type { SandboxCommandOptions, SandboxCommandResult } from "./runtime";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const PROXY_ENV_VARS = [
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
] as const;

export type CommandConfig = {
	executable: string;
	args: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
};

export type BoundedAppender = ReturnType<typeof createBoundedAppender>;

export type BackgroundCommandHandle = {
	child: ChildProcess;
	completion: Promise<SandboxCommandResult>;
	stderrBuffer: BoundedAppender;
	stdoutBuffer: BoundedAppender;
};

export function validateSessionId(sessionId: string) {
	if (!SESSION_ID_PATTERN.test(sessionId)) {
		throw new Error(`Invalid sandbox session ID: ${sessionId}`);
	}
}

export function getCheckedPath(sessionDirectory: string, targetPath: string) {
	const resolvedDir = resolve(sessionDirectory);
	const checkedPath = resolve(resolvedDir, targetPath);
	if (
		checkedPath !== resolvedDir &&
		!checkedPath.startsWith(`${resolvedDir}${sep}`)
	) {
		throw new Error("Session file path escapes the sandbox session directory.");
	}
	return checkedPath;
}

export function createBoundedAppender(limit = MAX_OUTPUT_BYTES) {
	let buffer = "";
	let truncated = false;
	return {
		append(chunk: string) {
			if (truncated) return;
			buffer += chunk;
			if (buffer.length > limit) {
				buffer = buffer.slice(0, limit);
				truncated = true;
			}
		},
		get value() {
			return truncated
				? `${buffer}\n[output truncated at ${limit} bytes]`
				: buffer;
		},
	};
}

function truncateOutput(output: string, limit = MAX_OUTPUT_BYTES): string {
	if (output.length <= limit) {
		return output;
	}
	return `${output.slice(0, limit)}\n[output truncated at ${limit} bytes]`;
}

export function trackProcess(
	activeProcesses: Map<string, Set<ChildProcess>>,
	sessionId: string,
	child: ChildProcess,
) {
	const processes = activeProcesses.get(sessionId) ?? new Set<ChildProcess>();
	processes.add(child);
	activeProcesses.set(sessionId, processes);

	child.on("close", () => {
		processes.delete(child);
		if (processes.size === 0) {
			activeProcesses.delete(sessionId);
		}
	});
}

export function killSessionProcesses(
	activeProcesses: Map<string, Set<ChildProcess>>,
	sessionId: string,
) {
	const processes = activeProcesses.get(sessionId);
	if (processes) {
		for (const p of processes) {
			if (!p.killed) {
				p.kill();
			}
		}
		activeProcesses.delete(sessionId);
	}
}

function buildExecFileOptions(config: CommandConfig, timeoutMs: number) {
	const options: { timeout: number; cwd?: string; env?: NodeJS.ProcessEnv } = {
		timeout: timeoutMs,
	};
	if (config.cwd !== undefined) options.cwd = config.cwd;
	if (config.env !== undefined) options.env = config.env;
	return options;
}

function buildSpawnOptions(config: CommandConfig) {
	const options: {
		stdio: ["pipe", "pipe", "pipe"];
		cwd?: string;
		env?: NodeJS.ProcessEnv;
	} = { stdio: ["pipe", "pipe", "pipe"] };
	if (config.cwd !== undefined) options.cwd = config.cwd;
	if (config.env !== undefined) options.env = config.env;
	return options;
}

export function runToCompletion(
	config: CommandConfig,
	options: SandboxCommandOptions,
): Promise<SandboxCommandResult> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return new Promise((resolve, reject) => {
		if (options.stdin !== undefined) {
			const child = spawn(
				config.executable,
				config.args,
				buildSpawnOptions(config),
			);

			let settled = false;
			const stdout = createBoundedAppender();
			const stderr = createBoundedAppender();
			child.stdout?.on("data", (chunk: Buffer) => {
				stdout.append(chunk.toString());
			});
			child.stderr?.on("data", (chunk: Buffer) => {
				stderr.append(chunk.toString());
			});

			const timeoutHandle = setTimeout(() => {
				if (!child.killed) {
					child.kill();
				}
				if (!settled) {
					settled = true;
					reject(new Error(`Command timed out after ${timeoutMs}ms.`));
				}
			}, timeoutMs);

			child.on("error", (error) => {
				clearTimeout(timeoutHandle);
				if (!settled) {
					settled = true;
					reject(error);
				}
			});

			child.on("close", (code) => {
				clearTimeout(timeoutHandle);
				if (!settled) {
					settled = true;
					resolve({
						exitCode: code,
						stderr: stderr.value,
						stdout: stdout.value,
					});
				}
			});

			child.stdin?.write(options.stdin);
			child.stdin?.end();
			return;
		}

		execFile(
			config.executable,
			config.args,
			buildExecFileOptions(config, timeoutMs),
			(error, stdout, stderr) => {
				if (error && !stdout && !stderr) {
					reject(error);
					return;
				}

				resolve({
					exitCode:
						typeof error?.code === "number" ? error.code : error ? 1 : 0,
					stderr: truncateOutput(stderr.toString()),
					stdout: truncateOutput(stdout.toString()),
				});
			},
		);
	});
}

export function runUntilFirstStdoutLine(
	config: CommandConfig,
	options: SandboxCommandOptions,
	onTrackProcess?: (child: ChildProcess) => void,
): Promise<SandboxCommandResult> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return new Promise((resolve, reject) => {
		const child = spawn(
			config.executable,
			config.args,
			buildSpawnOptions(config),
		);
		onTrackProcess?.(child);

		let resolved = false;
		const stdoutBuffer = createBoundedAppender();
		const stderr = createBoundedAppender();

		const finish = (result: SandboxCommandResult) => {
			if (resolved) {
				return;
			}

			resolved = true;
			clearTimeout(timeoutHandle);
			resolve(result);
		};

		const handleStdout = (chunk: Buffer) => {
			stdoutBuffer.append(chunk.toString());
			const newlineIndex = stdoutBuffer.value.indexOf("\n");
			if (newlineIndex === -1) {
				return;
			}

			const firstLine = stdoutBuffer.value.slice(0, newlineIndex).trim();
			finish({
				exitCode: null,
				stderr: stderr.value,
				stdout: firstLine,
			});

			if (options.keepAlive) {
				child.stdout?.off("data", handleStdout);
				child.stderr?.off("data", handleStderr);
				child.stdout?.resume();
				child.stderr?.resume();
				child.unref();
				return;
			}

			child.kill();
		};

		const handleStderr = (chunk: Buffer) => {
			stderr.append(chunk.toString());
		};

		const timeoutHandle = setTimeout(() => {
			if (!child.killed) {
				child.kill();
			}

			if (!resolved) {
				reject(new Error(`Command timed out after ${timeoutMs}ms.`));
			}
		}, timeoutMs);

		child.stdout?.on("data", handleStdout);
		child.stderr?.on("data", handleStderr);

		child.on("error", (error) => {
			clearTimeout(timeoutHandle);
			if (!resolved) {
				reject(error);
			}
		});

		child.on("close", (code) => {
			clearTimeout(timeoutHandle);
			if (!resolved) {
				finish({
					exitCode: code,
					stderr: stderr.value,
					stdout: stdoutBuffer.value.trim(),
				});
			}
		});

		if (options.stdin !== undefined) {
			child.stdin?.write(options.stdin);
		}
		child.stdin?.end();
	});
}

export function runInBackgroundUntilFirstStdoutLine(
	config: CommandConfig,
	options: SandboxCommandOptions,
	onTrackProcess?: (child: ChildProcess) => void,
): Promise<BackgroundCommandHandle & { result: SandboxCommandResult }> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return new Promise((resolve, reject) => {
		const child = spawn(
			config.executable,
			config.args,
			buildSpawnOptions(config),
		);
		onTrackProcess?.(child);

		let firstResultResolved = false;
		let completionResolved = false;
		const stdoutBuffer = createBoundedAppender();
		const stderrBuffer = createBoundedAppender();
		let resolveCompletion: (result: SandboxCommandResult) => void = () => {};
		const completion = new Promise<SandboxCommandResult>(
			(completionResolve) => {
				resolveCompletion = completionResolve;
			},
		);

		const finishFirstResult = (result: SandboxCommandResult) => {
			if (firstResultResolved) {
				return;
			}

			firstResultResolved = true;
			clearTimeout(timeoutHandle);
			resolve({
				child,
				completion,
				result,
				stderrBuffer,
				stdoutBuffer,
			});
		};

		const finishCompletion = (result: SandboxCommandResult) => {
			if (completionResolved) {
				return;
			}

			completionResolved = true;
			resolveCompletion(result);
		};

		const handleStdout = (chunk: Buffer) => {
			stdoutBuffer.append(chunk.toString());

			if (firstResultResolved) {
				return;
			}

			const newlineIndex = stdoutBuffer.value.indexOf("\n");
			if (newlineIndex === -1) {
				return;
			}

			const firstLine = stdoutBuffer.value.slice(0, newlineIndex).trim();
			finishFirstResult({
				exitCode: null,
				stderr: stderrBuffer.value,
				stdout: firstLine,
			});
		};

		const handleStderr = (chunk: Buffer) => {
			stderrBuffer.append(chunk.toString());
		};

		const timeoutHandle = setTimeout(() => {
			if (!child.killed) {
				child.kill();
			}

			if (!firstResultResolved) {
				reject(new Error(`Command timed out after ${timeoutMs}ms.`));
			}
		}, timeoutMs);

		child.stdout?.on("data", handleStdout);
		child.stderr?.on("data", handleStderr);

		child.on("error", (error) => {
			clearTimeout(timeoutHandle);
			if (!firstResultResolved) {
				reject(error);
				return;
			}

			finishCompletion({
				exitCode: 1,
				stderr:
					`${stderrBuffer.value}${stderrBuffer.value ? "\n" : ""}${error.message}`.trim(),
				stdout: stdoutBuffer.value.trim(),
			});
		});

		child.on("close", (code) => {
			clearTimeout(timeoutHandle);
			const result = {
				exitCode: code,
				stderr: stderrBuffer.value,
				stdout: stdoutBuffer.value.trim(),
			};

			if (!firstResultResolved) {
				finishFirstResult(result);
			}

			finishCompletion(result);
		});

		if (options.stdin !== undefined) {
			child.stdin?.write(options.stdin);
		}
		child.stdin?.end();
	});
}
