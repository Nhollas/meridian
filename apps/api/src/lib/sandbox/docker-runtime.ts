import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { SandboxConfig } from "./config";
import {
	type BackgroundExecResult,
	createDockerClient,
	type DockerClient,
	type OutputBuffer,
	type ProcessHandle,
} from "./docker-client";
import type {
	SandboxBackgroundCommand,
	SandboxBackgroundCommandSnapshot,
	SandboxBackgroundCommandStatus,
	SandboxCommandOptions,
	SandboxCommandResult,
	SandboxRuntime,
	SandboxSession,
	SandboxWaitForBackgroundCommandResult,
} from "./runtime";

import {
	DEFAULT_TIMEOUT_MS,
	getCheckedPath,
	validateSessionId,
} from "./runtime-shared";

type BackgroundCommandRecord = {
	command: string[];
	completion: Promise<SandboxCommandResult>;
	endedAt?: string;
	exitCode: number | null;
	id: string;
	process: ProcessHandle;
	startedAt: string;
	stderrBuffer: OutputBuffer;
	stdoutBuffer: OutputBuffer;
	status: SandboxBackgroundCommandStatus;
	terminationRequested: boolean;
};

export function createDockerRuntime(
	config: SandboxConfig,
	{ client = createDockerClient(config) }: { client?: DockerClient } = {},
): SandboxRuntime {
	const { instructionsFile, rootDirectory, sessionTtlMs } = config;
	const backgroundCommands = new Map<
		string,
		Map<string, BackgroundCommandRecord>
	>();
	const activeExecCount = new Map<string, number>();
	const sessionLocks = new Map<string, Promise<void>>();
	const sessionTimestamps = new Map<string, Date>();
	const ensuredDirectories = new Set<string>();

	function getSessionDirectory(sessionId: string) {
		validateSessionId(sessionId);
		return join(rootDirectory, sessionId);
	}

	function getContainerName(sessionId: string) {
		return `meridian-chat-sandbox-${sessionId}`;
	}

	function touchSession(sessionId: string): SandboxSession {
		const lastUsedAt = new Date();
		sessionTimestamps.set(sessionId, lastUsedAt);
		return { id: sessionId, lastUsedAt };
	}

	function getSessionBackgroundCommands(sessionId: string) {
		const commands = backgroundCommands.get(sessionId);
		if (commands) {
			return commands;
		}

		const next = new Map<string, BackgroundCommandRecord>();
		backgroundCommands.set(sessionId, next);
		return next;
	}

	function getRequiredBackgroundCommand(sessionId: string, commandId: string) {
		const command = backgroundCommands.get(sessionId)?.get(commandId);
		if (!command) {
			throw new Error(`Unknown background command: ${commandId}`);
		}
		return command;
	}

	function hasRunningBackgroundCommands(sessionId: string) {
		const commands = backgroundCommands.get(sessionId);
		if (!commands) {
			return false;
		}
		for (const record of commands.values()) {
			if (record.status === "running") {
				return true;
			}
		}
		return false;
	}

	function hasRunningCommands(sessionId: string) {
		return (
			(activeExecCount.get(sessionId) ?? 0) > 0 ||
			hasRunningBackgroundCommands(sessionId)
		);
	}

	function toBackgroundCommandSummary(
		record: BackgroundCommandRecord,
	): SandboxBackgroundCommand {
		return {
			command: [...record.command],
			exitCode: record.exitCode,
			id: record.id,
			startedAt: record.startedAt,
			status: record.status,
		};
	}

	function toBackgroundCommandSnapshot(
		record: BackgroundCommandRecord,
	): SandboxBackgroundCommandSnapshot {
		return {
			...toBackgroundCommandSummary(record),
			...(record.endedAt ? { endedAt: record.endedAt } : {}),
			stderr: record.stderrBuffer.value,
			stdout: record.stdoutBuffer.value,
		};
	}

	function registerBackgroundCommand(
		sessionId: string,
		command: string[],
		handle: BackgroundExecResult,
	) {
		const record: BackgroundCommandRecord = {
			command: [...command],
			completion: handle.completion,
			exitCode: null,
			id: randomUUID(),
			process: handle.process,
			startedAt: new Date().toISOString(),
			stderrBuffer: handle.stderrBuffer,
			stdoutBuffer: handle.stdoutBuffer,
			status: "running",
			terminationRequested: false,
		};

		getSessionBackgroundCommands(sessionId).set(record.id, record);
		void record.completion.then((result) => {
			record.exitCode = result.exitCode;
			record.endedAt = new Date().toISOString();
			record.status = record.terminationRequested
				? "terminated"
				: result.exitCode === 0
					? "completed"
					: "failed";
		});

		return record;
	}

	async function ensureSessionDirectory(sessionId: string) {
		if (ensuredDirectories.has(sessionId)) {
			return;
		}

		await mkdir(getSessionDirectory(sessionId), { recursive: true });
		ensuredDirectories.add(sessionId);
	}

	async function ensureContainerStarted(sessionId: string) {
		await ensureSessionDirectory(sessionId);
		const containerName = getContainerName(sessionId);
		const containerState = await client.getContainerState(containerName);

		if (containerState === "missing") {
			await client.createContainer(
				containerName,
				getSessionDirectory(sessionId),
				sessionId,
			);
		}

		if (containerState !== "running") {
			await client.startContainer(containerName);
		}
	}

	async function destroySessionResources(sessionId: string) {
		killBackgroundCommands(sessionId);
		backgroundCommands.delete(sessionId);

		await client.removeContainer(getContainerName(sessionId));

		await rm(getSessionDirectory(sessionId), {
			force: true,
			recursive: true,
		});
		sessionTimestamps.delete(sessionId);
		ensuredDirectories.delete(sessionId);
	}

	function killBackgroundCommands(sessionId: string) {
		const commands = backgroundCommands.get(sessionId);
		if (!commands) {
			return;
		}
		for (const record of commands.values()) {
			if (!record.process.killed) {
				record.process.kill();
			}
		}
	}

	async function reapExpiredSessions(excludingSessionId?: string) {
		const expirationCutoff = Date.now() - sessionTtlMs;

		for (const [sessionId, lastUsedAt] of sessionTimestamps) {
			if (sessionId === excludingSessionId) {
				continue;
			}
			if (lastUsedAt.getTime() >= expirationCutoff) {
				continue;
			}
			if (hasRunningCommands(sessionId)) {
				continue;
			}

			await withSessionLock(sessionId, async () => {
				const currentLastUsedAt = sessionTimestamps.get(sessionId);
				if (!currentLastUsedAt) {
					return;
				}
				if (currentLastUsedAt.getTime() >= expirationCutoff) {
					return;
				}
				if (hasRunningCommands(sessionId)) {
					return;
				}

				await destroySessionResources(sessionId);
			});
		}
	}

	async function ensureSession(sessionId: string) {
		await reapExpiredSessions(sessionId);
		return withSessionLock(sessionId, async () => {
			await ensureContainerStarted(sessionId);
			return touchSession(sessionId);
		});
	}

	async function withSessionLock<T>(
		sessionId: string,
		action: () => Promise<T>,
	): Promise<T> {
		const previous = sessionLocks.get(sessionId) ?? Promise.resolve();
		let release = () => {};
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.finally(() => current);
		sessionLocks.set(sessionId, tail);

		await previous.catch(() => undefined);

		try {
			return await action();
		} finally {
			release();
			if (sessionLocks.get(sessionId) === tail) {
				sessionLocks.delete(sessionId);
			}
		}
	}

	async function execCommand(
		sessionId: string,
		command: string[],
		options: SandboxCommandOptions,
	) {
		activeExecCount.set(sessionId, (activeExecCount.get(sessionId) ?? 0) + 1);
		try {
			return await execCommandInner(sessionId, command, options);
		} finally {
			const count = (activeExecCount.get(sessionId) ?? 1) - 1;
			if (count <= 0) {
				activeExecCount.delete(sessionId);
			} else {
				activeExecCount.set(sessionId, count);
			}
		}
	}

	async function execCommandInner(
		sessionId: string,
		command: string[],
		options: SandboxCommandOptions,
	) {
		const containerName = getContainerName(sessionId);
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const waitFor = options.waitFor ?? "exit";

		if (waitFor === "first-stdout-line" && options.keepAlive) {
			const handle = await client.execBackground(containerName, command, {
				stdin: options.stdin,
				timeoutMs,
			});

			if (handle.result.exitCode !== null) {
				return handle.result;
			}

			const backgroundCommand = registerBackgroundCommand(
				sessionId,
				command,
				handle,
			);
			handle.process.unref();

			return {
				...handle.result,
				backgroundCommandId: backgroundCommand.id,
				status: backgroundCommand.status,
			};
		}

		return client.exec(containerName, command, {
			stdin: options.stdin,
			timeoutMs,
			waitFor,
		});
	}

	return {
		async createSession(sessionId) {
			return ensureSession(sessionId);
		},
		async getInstructions(sessionId) {
			await ensureSessionDirectory(sessionId);
			touchSession(sessionId);
			return readFile(instructionsFile, "utf8");
		},
		async runCommand(sessionId, command, options = {}) {
			await ensureSession(sessionId);
			return execCommand(sessionId, command, options);
		},
		async getBackgroundCommand(sessionId, commandId) {
			await ensureSessionDirectory(sessionId);
			touchSession(sessionId);
			return toBackgroundCommandSnapshot(
				getRequiredBackgroundCommand(sessionId, commandId),
			);
		},
		async listBackgroundCommands(sessionId) {
			await ensureSessionDirectory(sessionId);
			touchSession(sessionId);
			return [...(backgroundCommands.get(sessionId)?.values() ?? [])].map(
				toBackgroundCommandSummary,
			);
		},
		async readSessionFile(sessionId, filePath) {
			await ensureSessionDirectory(sessionId);
			touchSession(sessionId);
			return readFile(
				getCheckedPath(getSessionDirectory(sessionId), filePath),
				"utf8",
			);
		},
		async listSessionFiles(sessionId, directoryPath = ".") {
			await ensureSessionDirectory(sessionId);
			const checkedPath = getCheckedPath(
				getSessionDirectory(sessionId),
				directoryPath,
			);
			const entries = await readdir(checkedPath, { withFileTypes: true });
			touchSession(sessionId);
			return entries.map((entry) => ({
				name: entry.name,
				path: join(directoryPath, entry.name),
				type: entry.isDirectory() ? "directory" : "file",
			}));
		},
		async writeSessionFile(sessionId, relativePath, contents) {
			await ensureSessionDirectory(sessionId);
			const filePath = getCheckedPath(
				getSessionDirectory(sessionId),
				relativePath,
			);
			await mkdir(dirname(filePath), { recursive: true });
			await writeFile(filePath, contents);
			touchSession(sessionId);
			return relative(getSessionDirectory(sessionId), filePath);
		},
		async terminateBackgroundCommand(sessionId, commandId) {
			await ensureSessionDirectory(sessionId);
			const command = getRequiredBackgroundCommand(sessionId, commandId);
			command.terminationRequested = true;
			if (!command.process.killed) {
				command.process.kill();
			}
			touchSession(sessionId);
			await command.completion;
			return toBackgroundCommandSnapshot(command);
		},
		async waitForBackgroundCommand(sessionId, commandId, timeoutMs) {
			await ensureSessionDirectory(sessionId);
			const command = getRequiredBackgroundCommand(sessionId, commandId);
			touchSession(sessionId);

			if (command.status === "running") {
				if (timeoutMs === undefined) {
					await command.completion;
				} else {
					await new Promise<void>((resolve) => {
						const timeoutHandle = setTimeout(resolve, timeoutMs);
						void command.completion.finally(() => {
							clearTimeout(timeoutHandle);
							resolve();
						});
					});
				}
			}

			const snapshot = toBackgroundCommandSnapshot(command);
			if (snapshot.status !== "running") {
				return snapshot;
			}

			return {
				...snapshot,
				timedOut: true,
			} satisfies SandboxWaitForBackgroundCommandResult;
		},
		async deleteSessionFile(sessionId, filePath) {
			await ensureSessionDirectory(sessionId);
			await rm(getCheckedPath(getSessionDirectory(sessionId), filePath), {
				force: true,
			});
			touchSession(sessionId);
		},
		async destroySession(sessionId) {
			await withSessionLock(sessionId, () =>
				destroySessionResources(sessionId),
			);
		},
	};
}
