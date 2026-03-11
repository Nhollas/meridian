export type SandboxSession = {
	id: string;
	lastUsedAt: Date;
};

export type SandboxCommandWaitFor = "exit" | "first-stdout-line";
export type SandboxBackgroundCommandStatus =
	| "running"
	| "completed"
	| "failed"
	| "terminated";

export type SandboxCommandOptions = {
	keepAlive?: boolean;
	stdin?: string;
	timeoutMs?: number;
	waitFor?: SandboxCommandWaitFor;
};

export type SandboxCommandResult = {
	backgroundCommandId?: string;
	exitCode: number | null;
	status?: SandboxBackgroundCommandStatus;
	stderr: string;
	stdout: string;
};

export type SandboxBackgroundCommand = {
	command: string[];
	exitCode: number | null;
	id: string;
	startedAt: string;
	status: SandboxBackgroundCommandStatus;
};

export type SandboxBackgroundCommandSnapshot = SandboxBackgroundCommand & {
	endedAt?: string;
	stderr: string;
	stdout: string;
};

export type SandboxWaitForBackgroundCommandResult =
	SandboxBackgroundCommandSnapshot & {
		timedOut?: boolean;
	};

export interface SandboxRuntime {
	createSession(sessionId: string): Promise<SandboxSession>;
	getInstructions(sessionId: string): Promise<string>;
	runCommand(
		sessionId: string,
		command: string[],
		options?: SandboxCommandOptions,
	): Promise<SandboxCommandResult>;
	getBackgroundCommand(
		sessionId: string,
		commandId: string,
	): Promise<SandboxBackgroundCommandSnapshot>;
	listBackgroundCommands(
		sessionId: string,
	): Promise<SandboxBackgroundCommand[]>;
	readSessionFile(sessionId: string, filePath: string): Promise<string>;
	listSessionFiles(
		sessionId: string,
		directoryPath?: string,
	): Promise<Array<{ name: string; path: string; type: "file" | "directory" }>>;
	terminateBackgroundCommand(
		sessionId: string,
		commandId: string,
	): Promise<SandboxBackgroundCommandSnapshot>;
	waitForBackgroundCommand(
		sessionId: string,
		commandId: string,
		timeoutMs?: number,
	): Promise<SandboxWaitForBackgroundCommandResult>;
	writeSessionFile(
		sessionId: string,
		relativePath: string,
		contents: string,
	): Promise<string>;
	deleteSessionFile(sessionId: string, filePath: string): Promise<void>;
	destroySession(sessionId: string): Promise<void>;
}
