import type { SandboxConfig } from "./config";
import type { SandboxCommandResult } from "./runtime";
import {
	DEFAULT_TIMEOUT_MS,
	runInBackgroundUntilFirstStdoutLine,
	runToCompletion,
	runUntilFirstStdoutLine,
} from "./runtime-shared";

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

const CONTAINER_HOME = "/sandbox-home";
const CONTAINER_EXTRA_CA_CERTS_PATH = "/sandbox-extra-ca.pem";

export function createDockerClient(config: SandboxConfig): DockerClient {
	const { dockerBinary, sandboxImage } = config;
	const { environmentArgs, mountArgs } = getContainerRuntimeArgs(config);

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

	function buildExecArgs(
		containerName: string,
		command: string[],
		options?: DockerExecOptions,
	): string[] {
		const args = ["exec"];
		if (options?.stdin !== undefined) {
			args.push("-i");
		}

		args.push(
			"-w",
			CONTAINER_HOME,
			"-e",
			`HOME=${CONTAINER_HOME}`,
			containerName,
			...command,
		);

		return args;
	}

	return {
		async getContainerState(containerName) {
			const result = await runDockerCli([
				"inspect",
				"--format",
				"{{.State.Running}}",
				containerName,
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
		},

		async createContainer(containerName, sessionDirectory) {
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
				"--add-host",
				"host.docker.internal:host-gateway",
				"--label",
				"meridian.chat.runtime=docker",
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
				`create sandbox container ${containerName}`,
			);
		},

		async startContainer(containerName) {
			await assertDockerSuccess(
				["start", containerName],
				`start sandbox container ${containerName}`,
			);
		},

		async removeContainer(containerName) {
			await runDockerCli(["rm", "--force", containerName]);
		},

		async exec(containerName, command, options = {}) {
			const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const waitFor = options.waitFor ?? "exit";
			const execArgs = buildExecArgs(containerName, command, options);
			const execConfig = { executable: dockerBinary, args: execArgs };

			if (waitFor === "first-stdout-line") {
				return runUntilFirstStdoutLine(execConfig, {
					...options,
					timeoutMs,
				});
			}

			return runToCompletion(execConfig, { ...options, timeoutMs });
		},

		async execBackground(containerName, command, options = {}) {
			const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const execArgs = buildExecArgs(containerName, command, options);
			const execConfig = { executable: dockerBinary, args: execArgs };

			const handle = await runInBackgroundUntilFirstStdoutLine(execConfig, {
				...options,
				timeoutMs,
			});

			return {
				completion: handle.completion,
				process: handle.child,
				result: handle.result,
				stderrBuffer: handle.stderrBuffer,
				stdoutBuffer: handle.stdoutBuffer,
			};
		},
	};
}

function getContainerRuntimeArgs(config: SandboxConfig) {
	const runtimeEnvironment: Record<string, string> = {
		MERIDIAN_AUTH_CLIENT_ID: config.meridianAuthClientId,
		MERIDIAN_AUTH_ISSUER: config.meridianAuthIssuer,
		...config.proxyEnv,
	};

	const mountArgs: string[] = [];
	if (config.extraCaCertsFile) {
		mountArgs.push(
			"-v",
			`${config.extraCaCertsFile}:${CONTAINER_EXTRA_CA_CERTS_PATH}:ro`,
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
