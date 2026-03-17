import type {
	BackgroundExecResult,
	ContainerState,
	DockerClient,
	DockerExecOptions,
} from "@/lib/sandbox/docker-client";
import type { SandboxCommandResult } from "@/lib/sandbox/runtime";

type DockerClientCall = {
	args: unknown[];
	method: string;
};

type ExecFixture = {
	command: string[];
	options?: DockerExecOptions;
	result: SandboxCommandResult;
};

type BackgroundExecFixture = {
	command: string[];
	options?: DockerExecOptions;
	result: SandboxCommandResult;
	completion?: Promise<SandboxCommandResult>;
	stdout?: string;
	stderr?: string;
};

export type FakeDockerClient = DockerClient & {
	calls: DockerClientCall[];
};

function normalizeOptions(options?: DockerExecOptions) {
	return Object.fromEntries(
		Object.entries(options ?? {})
			.filter(([, value]) => typeof value !== "undefined")
			.sort(([left], [right]) => left.localeCompare(right)),
	);
}

function matchesOptions(
	fixtureOptions: DockerExecOptions | undefined,
	callOptions: DockerExecOptions,
) {
	if (fixtureOptions === undefined) {
		return true;
	}
	return (
		JSON.stringify(normalizeOptions(fixtureOptions)) ===
		JSON.stringify(normalizeOptions(callOptions))
	);
}

export function createFakeDockerClient({
	execFixtures = [],
	backgroundExecFixtures = [],
}: {
	execFixtures?: ExecFixture[];
	backgroundExecFixtures?: BackgroundExecFixture[];
} = {}): FakeDockerClient {
	const calls: DockerClientCall[] = [];
	const containers = new Map<string, ContainerState>();

	function record(method: string, ...args: unknown[]) {
		calls.push({ args, method });
	}

	return {
		calls,

		async getContainerState(containerName) {
			record("getContainerState", containerName);
			return containers.get(containerName) ?? "missing";
		},

		async createContainer(containerName, sessionDirectory, sessionId) {
			record("createContainer", containerName, sessionDirectory, sessionId);
			containers.set(containerName, "stopped");
		},

		async startContainer(containerName) {
			record("startContainer", containerName);
			containers.set(containerName, "running");
		},

		async removeContainer(containerName) {
			record("removeContainer", containerName);
			containers.delete(containerName);
		},

		async exec(containerName, command, options = {}) {
			record("exec", containerName, command, options);
			const fixture = execFixtures.find(
				(f) =>
					JSON.stringify(f.command) === JSON.stringify(command) &&
					matchesOptions(f.options, options),
			);
			return fixture?.result ?? { exitCode: 0, stderr: "", stdout: "" };
		},

		async execBackground(containerName, command, options = {}) {
			record("execBackground", containerName, command, options);
			const fixture = backgroundExecFixtures.find(
				(f) => JSON.stringify(f.command) === JSON.stringify(command),
			);

			const result = fixture?.result ?? {
				exitCode: null,
				stderr: "",
				stdout: "",
			};

			let resolveCompletion:
				| ((result: SandboxCommandResult) => void)
				| undefined;
			const completion =
				fixture?.completion ??
				new Promise<SandboxCommandResult>((resolve) => {
					resolveCompletion = resolve;
				});

			let killed = false;

			return {
				completion,
				process: {
					kill() {
						killed = true;
						resolveCompletion?.({
							exitCode: 137,
							stderr: "",
							stdout: fixture?.stdout ?? "",
						});
					},
					get killed() {
						return killed;
					},
					unref() {},
				},
				result,
				stderrBuffer: {
					get value() {
						return fixture?.stderr ?? "";
					},
				},
				stdoutBuffer: {
					get value() {
						return fixture?.stdout ?? result.stdout;
					},
				},
			} satisfies BackgroundExecResult;
		},
	};
}
