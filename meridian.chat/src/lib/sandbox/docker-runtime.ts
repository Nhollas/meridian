import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type {
	SandboxBackgroundCommand,
	SandboxBackgroundCommandSnapshot,
	SandboxBackgroundCommandStatus,
	SandboxRuntime,
	SandboxSession,
	SandboxWaitForBackgroundCommandResult,
} from "./runtime";
import { DEFAULT_RUNTIME_INSTRUCTIONS } from "./runtime-instructions";
import {
	type BackgroundCommandHandle,
	type CommandConfig,
	DEFAULT_TIMEOUT_MS,
	getCheckedPath,
	killSessionProcesses,
	PROXY_ENV_VARS,
	runInBackgroundUntilFirstStdoutLine,
	runToCompletion,
	runUntilFirstStdoutLine,
	trackProcess,
	validateSessionId,
} from "./runtime-shared";

const CONTAINER_HOME = "/sandbox-home";
const CONTAINER_EXTRA_CA_CERTS_PATH = "/sandbox-extra-ca.pem";
const DEFAULT_DOCKER_IMAGE = "meridian-chat-sandbox:local";
const DEFAULT_MERIDIAN_AUTH_CLIENT_ID = "meridian-cli";
const DEFAULT_MERIDIAN_AUTH_ISSUER =
	"https://cicd-meridian-oauth-server-shadow.vassily.io/realms/meridian";
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;

type ContainerState = "missing" | "running" | "stopped";

type BackgroundCommandRecord = BackgroundCommandHandle & {
	command: string[];
	endedAt?: string;
	exitCode: number | null;
	id: string;
	startedAt: string;
	status: SandboxBackgroundCommandStatus;
	terminationRequested: boolean;
};

export function createDockerRuntime(): SandboxRuntime {
	const dockerBinary = process.env["SANDBOX_DOCKER_BIN"] ?? "docker";
	const rootDirectory =
		process.env["SANDBOX_STATE_DIR"] ??
		join(tmpdir(), "meridian-chat-sandbox-sessions");
	const sandboxImage =
		process.env["SANDBOX_DOCKER_IMAGE"] ?? DEFAULT_DOCKER_IMAGE;
	const sessionTtlMs = getSessionTtlMs();
	const activeProcesses = new Map<string, Set<ChildProcess>>();
	const backgroundCommands = new Map<
		string,
		Map<string, BackgroundCommandRecord>
	>();
	const sessionLocks = new Map<string, Promise<void>>();
	const sessionTimestamps = new Map<string, Date>();
	const ensuredDirectories = new Set<string>();
	const containerRuntimeArgs = getContainerRuntimeArgs();

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
		handle: BackgroundCommandHandle,
	) {
		const record: BackgroundCommandRecord = {
			...handle,
			command: [...command],
			exitCode: null,
			id: randomUUID(),
			startedAt: new Date().toISOString(),
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

	function runDockerCli(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS) {
		return runToCompletion({ executable: dockerBinary, args }, { timeoutMs });
	}

	async function assertDockerSuccess(
		args: string[],
		action: string,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	) {
		const result = await runDockerCli(args, timeoutMs);
		if (result.exitCode === 0) {
			return result;
		}

		const detail =
			result.stderr.trim() || result.stdout.trim() || "unknown error";
		throw new Error(`Failed to ${action}: ${detail}`);
	}

	async function getContainerState(sessionId: string): Promise<ContainerState> {
		const result = await runDockerCli([
			"inspect",
			"--format",
			"{{.State.Running}}",
			getContainerName(sessionId),
		]);

		if (result.exitCode !== 0) {
			return "missing";
		}

		const state = result.stdout.trim();
		if (state === "true") {
			return "running";
		}
		if (state === "false") {
			return "stopped";
		}

		throw new Error(`Unexpected Docker container state: ${state}`);
	}

	async function createContainer(sessionId: string) {
		const sessionDirectory = getSessionDirectory(sessionId);
		const containerName = getContainerName(sessionId);
		const { environmentArgs, mountArgs } = containerRuntimeArgs;
		const createArgs = [
			"create",
			"--name",
			containerName,
			"--hostname",
			containerName,
			"--init",
			"--cap-drop",
			"ALL",
			"--security-opt",
			"no-new-privileges",
			"--memory",
			"512m",
			"--pids-limit",
			"256",
			"--label",
			"meridian.chat.runtime=docker",
			"--label",
			`meridian.chat.session-id=${sessionId}`,
			"-e",
			`HOME=${CONTAINER_HOME}`,
			"-w",
			CONTAINER_HOME,
			"-v",
			`${sessionDirectory}:${CONTAINER_HOME}`,
			...mountArgs,
			...environmentArgs,
			sandboxImage,
			"sleep",
			"infinity",
		];

		await assertDockerSuccess(
			createArgs,
			`create sandbox container for session ${sessionId}`,
		);
	}

	async function ensureContainerStarted(sessionId: string) {
		await ensureSessionDirectory(sessionId);
		const containerState = await getContainerState(sessionId);

		if (containerState === "missing") {
			await createContainer(sessionId);
		}

		if (containerState !== "running") {
			await assertDockerSuccess(
				["start", getContainerName(sessionId)],
				`start sandbox container for session ${sessionId}`,
			);
		}
	}

	async function destroySessionResources(sessionId: string) {
		killSessionProcesses(activeProcesses, sessionId);
		backgroundCommands.delete(sessionId);

		await runDockerCli(["rm", "--force", getContainerName(sessionId)]);

		await rm(getSessionDirectory(sessionId), {
			force: true,
			recursive: true,
		});
		sessionTimestamps.delete(sessionId);
		ensuredDirectories.delete(sessionId);
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
			if ((activeProcesses.get(sessionId)?.size ?? 0) > 0) {
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
				if ((activeProcesses.get(sessionId)?.size ?? 0) > 0) {
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

	function buildDockerExecConfig(
		sessionId: string,
		command: string[],
		options: { stdin?: string },
	): CommandConfig {
		const args = ["exec"];
		if (options.stdin !== undefined) {
			args.push("-i");
		}

		args.push(
			"-w",
			CONTAINER_HOME,
			"-e",
			`HOME=${CONTAINER_HOME}`,
			getContainerName(sessionId),
			...command,
		);

		return { executable: dockerBinary, args };
	}

	return {
		async createSession(sessionId) {
			return ensureSession(sessionId);
		},
		async getInstructions(sessionId) {
			await ensureSessionDirectory(sessionId);
			touchSession(sessionId);
			const instructionsFile = process.env["SANDBOX_INSTRUCTIONS_FILE"];
			if (instructionsFile) {
				return readFile(instructionsFile, "utf8");
			}
			return DEFAULT_RUNTIME_INSTRUCTIONS;
		},
		async runCommand(sessionId, command, options = {}) {
			await ensureSession(sessionId);
			const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const waitFor = options.waitFor ?? "exit";
			const config = buildDockerExecConfig(sessionId, command, options);

			if (waitFor === "first-stdout-line" && options.keepAlive) {
				const backgroundHandle = await runInBackgroundUntilFirstStdoutLine(
					config,
					{ ...options, timeoutMs },
					(child) => trackProcess(activeProcesses, sessionId, child),
				);

				if (backgroundHandle.result.exitCode !== null) {
					return backgroundHandle.result;
				}

				const backgroundCommand = registerBackgroundCommand(
					sessionId,
					command,
					backgroundHandle,
				);
				backgroundHandle.child.unref();

				return {
					...backgroundHandle.result,
					backgroundCommandId: backgroundCommand.id,
					status: backgroundCommand.status,
				};
			}

			if (waitFor === "first-stdout-line") {
				return runUntilFirstStdoutLine(
					config,
					{ ...options, timeoutMs },
					(child) => trackProcess(activeProcesses, sessionId, child),
				);
			}

			return runToCompletion(config, { ...options, timeoutMs });
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
			if (!command.child.killed) {
				command.child.kill();
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

function getContainerRuntimeArgs() {
	const runtimeEnvironment: Record<string, string> = {
		MERIDIAN_AUTH_CLIENT_ID:
			process.env["MERIDIAN_AUTH_CLIENT_ID"] ?? DEFAULT_MERIDIAN_AUTH_CLIENT_ID,
		MERIDIAN_AUTH_ISSUER:
			process.env["MERIDIAN_AUTH_ISSUER"] ?? DEFAULT_MERIDIAN_AUTH_ISSUER,
	};

	for (const envName of PROXY_ENV_VARS) {
		const value = process.env[envName];
		if (value) {
			runtimeEnvironment[envName] = value;
		}
	}

	const mountArgs: string[] = [];
	const extraCaCertsFile =
		process.env["SANDBOX_EXTRA_CA_CERTS_FILE"] ??
		process.env["NODE_EXTRA_CA_CERTS"];
	if (extraCaCertsFile) {
		mountArgs.push(
			"-v",
			`${extraCaCertsFile}:${CONTAINER_EXTRA_CA_CERTS_PATH}:ro`,
		);
		runtimeEnvironment["NODE_EXTRA_CA_CERTS"] = CONTAINER_EXTRA_CA_CERTS_PATH;
	}

	const environmentArgs = Object.entries(runtimeEnvironment).flatMap(
		([envName, value]) => ["-e", `${envName}=${value}`],
	);

	return {
		environmentArgs,
		mountArgs,
	};
}

function getSessionTtlMs() {
	const raw = process.env["SANDBOX_SESSION_TTL_MS"];
	if (!raw) {
		return DEFAULT_SESSION_TTL_MS;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_SESSION_TTL_MS;
	}

	return parsed;
}
