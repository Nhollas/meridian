import type {
	SandboxBackgroundCommand,
	SandboxBackgroundCommandSnapshot,
	SandboxBackgroundCommandStatus,
	SandboxCommandOptions,
	SandboxCommandResult,
	SandboxRuntime,
	SandboxSession,
	SandboxWaitForBackgroundCommandResult,
} from "@/lib/sandbox/runtime";
import { getCheckedPath } from "@/lib/sandbox/runtime-shared";

type RuntimeCall = {
	args: unknown[];
	method: string;
	sessionId: string;
};

type CommandFixture = {
	command: string[];
	options?: SandboxCommandOptions;
	result: SandboxCommandResult;
};

type BackgroundCommandFixture = {
	current?: Partial<SandboxBackgroundCommandSnapshot>;
	terminateResult?: SandboxBackgroundCommandSnapshot;
	waitResult?: SandboxWaitForBackgroundCommandResult;
};

type BackgroundCommandState = {
	current: SandboxBackgroundCommandSnapshot;
	terminateResult?: SandboxBackgroundCommandSnapshot;
	waitResult?: SandboxWaitForBackgroundCommandResult;
};

type SessionState = {
	backgroundCommands: Map<string, BackgroundCommandState>;
	files: Map<string, string>;
};

export type InMemorySandboxRuntime = SandboxRuntime & {
	calls: RuntimeCall[];
};

const DEFAULT_STARTED_AT = "2026-03-11T12:00:00.000Z";
const DEFAULT_ENDED_AT = "2026-03-11T12:00:05.000Z";

export function createInMemorySandboxRuntime({
	backgroundCommands = {},
	commandFixtures = [],
	enforcePathSafety = false,
	files = {},
	instructions = "runtime instructions",
}: {
	backgroundCommands?: Record<string, BackgroundCommandFixture>;
	commandFixtures?: CommandFixture[];
	enforcePathSafety?: boolean;
	files?: Record<string, string>;
	instructions?: string;
} = {}): InMemorySandboxRuntime {
	const calls: RuntimeCall[] = [];
	const sessions = new Map<string, SessionState>();

	function getSession(sessionId: string): SessionState {
		const existing = sessions.get(sessionId);
		if (existing) {
			return existing;
		}

		const next = {
			backgroundCommands: new Map(),
			files: new Map(Object.entries(files)),
		};
		sessions.set(sessionId, next);
		return next;
	}

	function record(sessionId: string, method: string, ...args: unknown[]) {
		calls.push({ args, method, sessionId });
	}

	async function createSession(sessionId: string): Promise<SandboxSession> {
		record(sessionId, "createSession");
		getSession(sessionId);
		return { id: sessionId, lastUsedAt: new Date() };
	}

	async function getInstructions(sessionId: string): Promise<string> {
		record(sessionId, "getInstructions");
		getSession(sessionId);
		return instructions;
	}

	async function runCommand(
		sessionId: string,
		command: string[],
		options?: SandboxCommandOptions,
	): Promise<SandboxCommandResult> {
		record(sessionId, "runCommand", command, options);
		const session = getSession(sessionId);
		const fixture = commandFixtures.find((candidate) =>
			matchesCommandFixture(candidate, command, options),
		);
		const result = fixture
			? cloneCommandResult(fixture.result)
			: {
					exitCode: 0,
					stderr: "",
					stdout: "",
				};

		if (result.backgroundCommandId) {
			session.backgroundCommands.set(
				result.backgroundCommandId,
				createBackgroundCommandState({
					command,
					commandId: result.backgroundCommandId,
					fixture: backgroundCommands[result.backgroundCommandId],
					result,
				}),
			);
		}

		return result;
	}

	async function getBackgroundCommand(
		sessionId: string,
		commandId: string,
	): Promise<SandboxBackgroundCommandSnapshot> {
		record(sessionId, "getBackgroundCommand", commandId);
		const command = getBackgroundCommandState(sessionId, commandId);
		return cloneBackgroundCommandSnapshot(command.current);
	}

	async function listBackgroundCommands(
		sessionId: string,
	): Promise<SandboxBackgroundCommand[]> {
		record(sessionId, "listBackgroundCommands");
		const session = getSession(sessionId);
		return [...session.backgroundCommands.values()].map(({ current }) => ({
			command: [...current.command],
			exitCode: current.exitCode,
			id: current.id,
			startedAt: current.startedAt,
			status: current.status,
		}));
	}

	async function readSessionFile(
		sessionId: string,
		filePath: string,
	): Promise<string> {
		record(sessionId, "readSessionFile", filePath);
		assertSafePath(sessionId, filePath);
		const session = getSession(sessionId);
		const contents = session.files.get(filePath);
		if (typeof contents !== "string") {
			throw new Error(`File not found: ${filePath}`);
		}
		return contents;
	}

	async function listSessionFiles(
		sessionId: string,
		directoryPath = ".",
	): Promise<
		Array<{ name: string; path: string; type: "file" | "directory" }>
	> {
		record(sessionId, "listSessionFiles", directoryPath);
		assertSafePath(sessionId, directoryPath);
		const session = getSession(sessionId);
		return [...session.files.keys()].map((path) => ({
			name: path.split("/").at(-1) ?? path,
			path,
			type: "file" as const,
		}));
	}

	async function terminateBackgroundCommand(
		sessionId: string,
		commandId: string,
	): Promise<SandboxBackgroundCommandSnapshot> {
		record(sessionId, "terminateBackgroundCommand", commandId);
		const command = getBackgroundCommandState(sessionId, commandId);
		const terminated = command.terminateResult ?? {
			...command.current,
			endedAt: DEFAULT_ENDED_AT,
			status: "terminated" as const,
		};
		command.current = cloneBackgroundCommandSnapshot(terminated);
		return cloneBackgroundCommandSnapshot(command.current);
	}

	async function waitForBackgroundCommand(
		sessionId: string,
		commandId: string,
		timeoutMs?: number,
	): Promise<SandboxWaitForBackgroundCommandResult> {
		record(sessionId, "waitForBackgroundCommand", commandId, timeoutMs);
		const command = getBackgroundCommandState(sessionId, commandId);
		if (command.waitResult) {
			command.current = cloneBackgroundCommandSnapshot(command.waitResult);
			return cloneWaitForBackgroundCommandResult(command.waitResult);
		}

		return cloneWaitForBackgroundCommandResult(command.current);
	}

	async function writeSessionFile(
		sessionId: string,
		relativePath: string,
		contents: string,
	): Promise<string> {
		record(sessionId, "writeSessionFile", relativePath, contents);
		assertSafePath(sessionId, relativePath);
		const session = getSession(sessionId);
		session.files.set(relativePath, contents);
		return `/${relativePath}`;
	}

	async function deleteSessionFile(
		sessionId: string,
		filePath: string,
	): Promise<void> {
		record(sessionId, "deleteSessionFile", filePath);
		assertSafePath(sessionId, filePath);
		const session = getSession(sessionId);
		session.files.delete(filePath);
	}

	async function destroySession(sessionId: string): Promise<void> {
		record(sessionId, "destroySession");
		sessions.delete(sessionId);
	}

	return {
		calls,
		createSession,
		deleteSessionFile,
		destroySession,
		getBackgroundCommand,
		getInstructions,
		listBackgroundCommands,
		listSessionFiles,
		readSessionFile,
		runCommand,
		terminateBackgroundCommand,
		waitForBackgroundCommand,
		writeSessionFile,
	};

	function getBackgroundCommandState(sessionId: string, commandId: string) {
		const session = getSession(sessionId);
		const command = session.backgroundCommands.get(commandId);
		if (!command) {
			throw new Error(`Unknown background command: ${commandId}`);
		}
		return command;
	}

	function assertSafePath(sessionId: string, targetPath: string) {
		if (!enforcePathSafety) {
			return;
		}

		getCheckedPath(`/sandbox/${sessionId}`, targetPath);
	}
}

function createBackgroundCommandState({
	command,
	commandId,
	fixture,
	result,
}: {
	command: string[];
	commandId: string;
	fixture: BackgroundCommandFixture | undefined;
	result: SandboxCommandResult;
}): BackgroundCommandState {
	const state: BackgroundCommandState = {
		current: {
			command: [...(fixture?.current?.command ?? command)],
			exitCode: fixture?.current?.exitCode ?? result.exitCode,
			...(fixture?.current?.endedAt
				? { endedAt: fixture.current.endedAt }
				: {}),
			id: commandId,
			startedAt: fixture?.current?.startedAt ?? DEFAULT_STARTED_AT,
			status:
				fixture?.current?.status ??
				result.status ??
				inferBackgroundStatus(result.exitCode),
			stderr: fixture?.current?.stderr ?? result.stderr,
			stdout: fixture?.current?.stdout ?? result.stdout,
		},
	};

	if (fixture?.terminateResult) {
		state.terminateResult = cloneBackgroundCommandSnapshot(
			fixture.terminateResult,
		);
	}

	if (fixture?.waitResult) {
		state.waitResult = cloneWaitForBackgroundCommandResult(fixture.waitResult);
	}

	return state;
}

function inferBackgroundStatus(
	exitCode: number | null,
): SandboxBackgroundCommandStatus {
	if (exitCode === null) {
		return "running";
	}

	return exitCode === 0 ? "completed" : "failed";
}

function matchesCommandFixture(
	fixture: CommandFixture,
	command: string[],
	options?: SandboxCommandOptions,
) {
	return (
		JSON.stringify(fixture.command) === JSON.stringify(command) &&
		JSON.stringify(normalizeOptions(fixture.options)) ===
			JSON.stringify(normalizeOptions(options))
	);
}

function normalizeOptions(options?: SandboxCommandOptions) {
	return Object.fromEntries(
		Object.entries(options ?? {})
			.filter(([, value]) => typeof value !== "undefined")
			.sort(([left], [right]) => left.localeCompare(right)),
	);
}

function cloneCommandResult(
	result: SandboxCommandResult,
): SandboxCommandResult {
	return { ...result };
}

function cloneBackgroundCommandSnapshot(
	command: SandboxBackgroundCommandSnapshot,
): SandboxBackgroundCommandSnapshot {
	return {
		command: [...command.command],
		exitCode: command.exitCode,
		...(command.endedAt ? { endedAt: command.endedAt } : {}),
		id: command.id,
		startedAt: command.startedAt,
		status: command.status,
		stderr: command.stderr,
		stdout: command.stdout,
	};
}

function cloneWaitForBackgroundCommandResult(
	command: SandboxWaitForBackgroundCommandResult,
): SandboxWaitForBackgroundCommandResult {
	return {
		...cloneBackgroundCommandSnapshot(command),
		...(typeof command.timedOut === "boolean"
			? { timedOut: command.timedOut }
			: {}),
	};
}
