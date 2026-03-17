import type { SandboxCommandResult } from "./runtime";

export type ContainerState = "missing" | "running" | "stopped";

export type DockerExecOptions = {
	stdin?: string;
	timeoutMs?: number;
	waitFor?: "exit" | "first-stdout-line";
};

export type ProcessHandle = {
	kill(): void;
	readonly killed: boolean;
	unref(): void;
};

export type OutputBuffer = {
	readonly value: string;
};

export type BackgroundExecResult = {
	completion: Promise<SandboxCommandResult>;
	process: ProcessHandle;
	result: SandboxCommandResult;
	stderrBuffer: OutputBuffer;
	stdoutBuffer: OutputBuffer;
};

export interface DockerClient {
	getContainerState(containerName: string): Promise<ContainerState>;
	createContainer(
		containerName: string,
		sessionDirectory: string,
	): Promise<void>;
	startContainer(containerName: string): Promise<void>;
	removeContainer(containerName: string): Promise<void>;
	exec(
		containerName: string,
		command: string[],
		options?: DockerExecOptions,
	): Promise<SandboxCommandResult>;
	execBackground(
		containerName: string,
		command: string[],
		options?: DockerExecOptions,
	): Promise<BackgroundExecResult>;
}
