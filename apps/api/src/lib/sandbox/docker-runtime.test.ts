import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDefined } from "../../../tests/support/assertions";

const childProcessMocks = vi.hoisted(() => ({
	execFile: vi.fn(),
	spawn: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
	mkdir: vi.fn(),
	readdir: vi.fn(),
	readFile: vi.fn(),
	rm: vi.fn(),
	writeFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
	spawn: childProcessMocks.spawn,
}));

vi.mock("node:fs/promises", () => ({
	mkdir: fsMocks.mkdir,
	readdir: fsMocks.readdir,
	readFile: fsMocks.readFile,
	rm: fsMocks.rm,
	writeFile: fsMocks.writeFile,
}));

import type { SandboxConfig } from "@/lib/sandbox/config";
import { createDockerRuntime } from "@/lib/sandbox/docker-runtime";

function createTestConfig(
	overrides: Partial<SandboxConfig> = {},
): SandboxConfig {
	return {
		dockerBinary: "docker",
		extraCaCertsFile: undefined,
		instructionsFile: "/tmp/test-instructions.txt",
		meridianAuthClientId: "meridian-cli",
		meridianAuthIssuer: "http://host.docker.internal:8080/realms/meridian",
		proxyEnv: {},
		rootDirectory: "/tmp/meridian-chat-sandbox-sessions",
		runtime: "docker",
		sandboxImage: "meridian-chat-sandbox:local",
		sessionTtlMs: 5 * 60 * 1000,
		...overrides,
	};
}

describe("createDockerRuntime", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		childProcessMocks.execFile.mockReset();
		childProcessMocks.spawn.mockReset();
		fsMocks.mkdir.mockReset();
		fsMocks.readdir.mockReset();
		fsMocks.readFile.mockReset();
		fsMocks.rm.mockReset();
		fsMocks.writeFile.mockReset();
		fsMocks.mkdir.mockResolvedValue(undefined);
		fsMocks.rm.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("creates and starts a per-session container on first use", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		mockExecFileSequence([
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created-container-id\n" },
			{ exitCode: 0, stdout: "session-123\n" },
			{ exitCode: 0, stdout: "hello from sandbox\n" },
		]);

		const result = await runtime.runCommand("session-123", ["echo", "hello"]);

		expect(result).toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "hello from sandbox\n",
		});
		expect(fsMocks.mkdir).toHaveBeenCalledWith(
			expect.stringContaining("/session-123"),
			{ recursive: true },
		);
		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			1,
			"docker",
			[
				"inspect",
				"--format",
				"{{.State.Running}}",
				"meridian-chat-sandbox-session-123",
			],
			{ timeout: 30000 },
			expect.any(Function),
		);
		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			2,
			"docker",
			expect.arrayContaining([
				"create",
				"--name",
				"meridian-chat-sandbox-session-123",
				"--cap-drop",
				"ALL",
				"--security-opt",
				"no-new-privileges",
				"--memory",
				"512m",
				"--pids-limit",
				"256",
				"-v",
				expect.stringContaining("/session-123:/sandbox-home"),
				"meridian-chat-sandbox:local",
				"sleep",
				"infinity",
			]),
			{ timeout: 30000 },
			expect.any(Function),
		);
		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			4,
			"docker",
			[
				"exec",
				"-w",
				"/sandbox-home",
				"-e",
				"HOME=/sandbox-home",
				"meridian-chat-sandbox-session-123",
				"echo",
				"hello",
			],
			{ timeout: 30000 },
			expect.any(Function),
		);
	});

	it("reaps expired idle sessions after five minutes", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		mockExecFileSequence([
			// createSession("old-session"): inspect (missing) → create → start
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created-old\n" },
			{ exitCode: 0, stdout: "old-session\n" },
			// createSession("new-session"): reap old → rm --force, then inspect (missing) → create → start
			{ exitCode: 0, stdout: "removed\n" },
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created-new\n" },
			{ exitCode: 0, stdout: "new-session\n" },
		]);

		await runtime.createSession("old-session");
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		await runtime.createSession("new-session");

		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"docker",
			["rm", "--force", "meridian-chat-sandbox-old-session"],
			{ timeout: 30000 },
			expect.any(Function),
		);
		expect(fsMocks.rm).toHaveBeenCalledWith(
			expect.stringContaining("/old-session"),
			{ force: true, recursive: true },
		);
	});

	it("passes configured auth environment into new containers", async () => {
		const runtime = createDockerRuntime(
			createTestConfig({
				meridianAuthClientId: "meridian-cli",
				meridianAuthIssuer: "https://issuer.example.com",
			}),
		);
		mockExecFileSequence([
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created\n" },
			{ exitCode: 0, stdout: "started\n" },
		]);

		await runtime.createSession("session-456");

		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			2,
			"docker",
			expect.arrayContaining([
				"-e",
				"MERIDIAN_AUTH_CLIENT_ID=meridian-cli",
				"-e",
				"MERIDIAN_AUTH_ISSUER=https://issuer.example.com",
			]),
			{ timeout: 30000 },
			expect.any(Function),
		);
	});

	it("uses default auth environment when the shell does not provide it", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		mockExecFileSequence([
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created\n" },
			{ exitCode: 0, stdout: "started\n" },
		]);

		await runtime.createSession("session-default-env");

		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			2,
			"docker",
			expect.arrayContaining([
				"-e",
				"MERIDIAN_AUTH_CLIENT_ID=meridian-cli",
				"-e",
				"MERIDIAN_AUTH_ISSUER=http://host.docker.internal:8080/realms/meridian",
			]),
			{ timeout: 30000 },
			expect.any(Function),
		);
	});

	it("mounts an extra CA bundle and forwards proxy environment when configured", async () => {
		const runtime = createDockerRuntime(
			createTestConfig({
				extraCaCertsFile: "/Users/example/corp-root.pem",
				proxyEnv: {
					HTTPS_PROXY: "http://proxy.example.net:8080",
					NO_PROXY: "localhost,127.0.0.1",
				},
			}),
		);
		mockExecFileSequence([
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created\n" },
			{ exitCode: 0, stdout: "started\n" },
		]);

		await runtime.createSession("session-ca");

		expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(
			2,
			"docker",
			expect.arrayContaining([
				"-v",
				"/Users/example/corp-root.pem:/sandbox-extra-ca.pem:ro",
				"-e",
				"NODE_EXTRA_CA_CERTS=/sandbox-extra-ca.pem",
				"-e",
				"HTTPS_PROXY=http://proxy.example.net:8080",
				"-e",
				"NO_PROXY=localhost,127.0.0.1",
			]),
			{ timeout: 30000 },
			expect.any(Function),
		);
	});

	it("reads runtime instructions from the configured instructions file", async () => {
		fsMocks.readFile.mockResolvedValue("Use the configured instructions.\n");
		const runtime = createDockerRuntime(
			createTestConfig({
				instructionsFile: "/tmp/runtime-instructions.txt",
			}),
		);

		const instructions = await runtime.getInstructions("session-instructions");

		expect(instructions).toBe("Use the configured instructions.\n");
		expect(fsMocks.readFile).toHaveBeenCalledWith(
			"/tmp/runtime-instructions.txt",
			"utf8",
		);
		expect(fsMocks.mkdir).toHaveBeenCalledWith(
			expect.stringContaining("/session-instructions"),
			{ recursive: true },
		);
	});

	it("serializes concurrent container setup for the same session", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		let firstInspectCallback:
			| ((
					error: Error | NodeJS.ErrnoException | null,
					stdout: string,
					stderr: string,
			  ) => void)
			| undefined;

		childProcessMocks.execFile.mockImplementation(
			(
				_file: string,
				args: string[],
				_options: { timeout: number },
				callback: (
					error: Error | NodeJS.ErrnoException | null,
					stdout: string,
					stderr: string,
				) => void,
			) => {
				if (args[0] === "inspect" && args[3] === "meridian-chat-sandbox-race") {
					if (!firstInspectCallback) {
						firstInspectCallback = callback;
						return;
					}

					callback(null, "true\n", "");
					return;
				}

				if (args[0] === "create") {
					callback(null, "created\n", "");
					return;
				}

				if (args[0] === "start") {
					callback(null, "started\n", "");
					return;
				}

				if (args[0] === "exec" && args.at(-1) === "one") {
					callback(null, "first\n", "");
					return;
				}

				if (args[0] === "exec" && args.at(-1) === "two") {
					callback(null, "second\n", "");
					return;
				}

				throw new Error(`Unexpected execFile args: ${args.join(" ")}`);
			},
		);

		const firstRun = runtime.runCommand("race", ["echo", "one"]);
		await vi.waitFor(() => {
			expect(childProcessMocks.execFile).toHaveBeenCalledTimes(1);
		});
		const secondRun = runtime.runCommand("race", ["echo", "two"]);
		await Promise.resolve();
		expect(childProcessMocks.execFile).toHaveBeenCalledTimes(1);

		firstInspectCallback?.(
			Object.assign(new Error("No such container"), { code: 1 }),
			"",
			"No such container",
		);

		await vi.waitFor(() => {
			expect(
				childProcessMocks.execFile.mock.calls.filter(
					([, args]) => args[0] === "create",
				),
			).toHaveLength(1);
		});

		await expect(firstRun).resolves.toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "first\n",
		});
		await expect(secondRun).resolves.toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "second\n",
		});
		expect(
			childProcessMocks.execFile.mock.calls.filter(
				([, args]) => args[0] === "create",
			),
		).toHaveLength(1);
	});

	it("uses docker exec with spawn when stdin is provided", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		mockExecFileSequence([
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created\n" },
			{ exitCode: 0, stdout: "started\n" },
		]);
		const child = createMockChildProcess();
		childProcessMocks.spawn.mockReturnValue(child);

		const resultPromise = runtime.runCommand("session-stdin", ["cat"], {
			stdin: "payload",
		});
		await vi.waitFor(() => {
			expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
		});
		child.stdout.emit("data", Buffer.from("echoed payload"));
		child.stderr.emit("data", Buffer.from(""));
		child.emit("close", 0);

		await expect(resultPromise).resolves.toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "echoed payload",
		});
		expect(childProcessMocks.spawn).toHaveBeenCalledWith(
			"docker",
			[
				"exec",
				"-i",
				"-w",
				"/sandbox-home",
				"-e",
				"HOME=/sandbox-home",
				"meridian-chat-sandbox-session-stdin",
				"cat",
			],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		expect(child.stdin.write).toHaveBeenCalledWith("payload");
		expect(child.stdin.end).toHaveBeenCalled();
	});

	it("returns a session-relative path when writing a file", async () => {
		const runtime = createDockerRuntime(createTestConfig());

		const result = await runtime.writeSessionFile(
			"session-write",
			"requests/travel-request-annual.json",
			'{"destination":"Greece"}\n',
		);

		expect(result).toBe("requests/travel-request-annual.json");
		expect(fsMocks.mkdir).toHaveBeenCalledWith(
			expect.stringContaining("/session-write/requests"),
			{ recursive: true },
		);
		expect(fsMocks.writeFile).toHaveBeenCalledWith(
			expect.stringContaining(
				"/session-write/requests/travel-request-annual.json",
			),
			'{"destination":"Greece"}\n',
		);
	});

	it("does not reap an expired session while a background command is still running", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		mockExecFileSequence([
			// session-busy background command setup
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created-busy\n" },
			{ exitCode: 0, stdout: "started-busy\n" },
			// createSession("session-fresh")
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created-fresh\n" },
			{ exitCode: 0, stdout: "started-fresh\n" },
		]);
		const child = createMockChildProcess();
		childProcessMocks.spawn.mockReturnValue(child);

		const backgroundPromise = runtime.runCommand(
			"session-busy",
			["meridian", "auth", "login", "--json"],
			{
				keepAlive: true,
				waitFor: "first-stdout-line",
			},
		);

		await vi.waitFor(() => {
			expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
		});
		child.stdout.emit(
			"data",
			Buffer.from(
				'{"status":"pending","interval_seconds":5,"user_code":"ABCD-1234"}\n',
			),
		);

		await expect(backgroundPromise).resolves.toEqual({
			backgroundCommandId: expect.any(String),
			exitCode: null,
			status: "running",
			stderr: "",
			stdout:
				'{"status":"pending","interval_seconds":5,"user_code":"ABCD-1234"}',
		});

		vi.advanceTimersByTime(5 * 60 * 1000 + 1);

		await expect(runtime.createSession("session-fresh")).resolves.toEqual({
			id: "session-fresh",
			lastUsedAt: expect.any(Date),
		});

		expect(
			childProcessMocks.execFile.mock.calls.filter(
				([, args]) =>
					args[0] === "rm" && args[2] === "meridian-chat-sandbox-session-busy",
			),
		).toHaveLength(0);
	});

	it("tracks background commands started from the first stdout line", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		mockExecFileSequence([
			{ exitCode: 1, stderr: "No such container" },
			{ exitCode: 0, stdout: "created\n" },
			{ exitCode: 0, stdout: "started\n" },
		]);
		const child = createMockChildProcess();
		childProcessMocks.spawn.mockReturnValue(child);

		const resultPromise = runtime.runCommand(
			"session-background",
			["meridian", "auth", "login", "--json"],
			{
				keepAlive: true,
				waitFor: "first-stdout-line",
			},
		);

		await vi.waitFor(() => {
			expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
		});

		child.stdout.emit(
			"data",
			Buffer.from(
				'{"status":"pending","interval_seconds":5,"user_code":"ABCD-1234"}\n',
			),
		);

		const result = await resultPromise;

		expect(result).toEqual({
			backgroundCommandId: expect.any(String),
			exitCode: null,
			status: "running",
			stderr: "",
			stdout:
				'{"status":"pending","interval_seconds":5,"user_code":"ABCD-1234"}',
		});
		expect(child.unref).toHaveBeenCalled();

		const backgroundCommandId = result.backgroundCommandId;
		assertDefined(backgroundCommandId);

		await expect(
			runtime.listBackgroundCommands("session-background"),
		).resolves.toEqual([
			{
				command: ["meridian", "auth", "login", "--json"],
				exitCode: null,
				id: backgroundCommandId,
				startedAt: expect.any(String),
				status: "running",
			},
		]);
		await expect(
			runtime.getBackgroundCommand("session-background", backgroundCommandId),
		).resolves.toEqual({
			command: ["meridian", "auth", "login", "--json"],
			exitCode: null,
			id: result.backgroundCommandId,
			startedAt: expect.any(String),
			status: "running",
			stderr: "",
			stdout:
				'{"status":"pending","interval_seconds":5,"user_code":"ABCD-1234"}\n',
		});

		child.stdout.emit(
			"data",
			Buffer.from(
				'{"status":"authenticated","interval_seconds":5,"user":"john.doe@example.com"}\n',
			),
		);
		child.emit("close", 0);

		await expect(
			runtime.waitForBackgroundCommand(
				"session-background",
				backgroundCommandId,
			),
		).resolves.toEqual({
			command: ["meridian", "auth", "login", "--json"],
			endedAt: expect.any(String),
			exitCode: 0,
			id: result.backgroundCommandId,
			startedAt: expect.any(String),
			status: "completed",
			stderr: "",
			stdout:
				'{"status":"pending","interval_seconds":5,"user_code":"ABCD-1234"}\n{"status":"authenticated","interval_seconds":5,"user":"john.doe@example.com"}\n',
		});
	});

	it("does not reap an expired session while another caller is reviving it", async () => {
		const runtime = createDockerRuntime(createTestConfig());
		let sessionAInspectCount = 0;
		let reviveInspectCallback:
			| ((
					error: Error | NodeJS.ErrnoException | null,
					stdout: string,
					stderr: string,
			  ) => void)
			| undefined;

		childProcessMocks.execFile.mockImplementation(
			(
				_file: string,
				args: string[],
				_options: { timeout: number },
				callback: (
					error: Error | NodeJS.ErrnoException | null,
					stdout: string,
					stderr: string,
				) => void,
			) => {
				if (
					args[0] === "inspect" &&
					args[3] === "meridian-chat-sandbox-session-a"
				) {
					sessionAInspectCount += 1;

					if (sessionAInspectCount === 1) {
						callback(
							Object.assign(new Error("No such container"), { code: 1 }),
							"",
							"No such container",
						);
						return;
					}

					if (sessionAInspectCount === 2) {
						reviveInspectCallback = callback;
						return;
					}
				}

				if (
					args[0] === "create" &&
					args.includes("meridian-chat-sandbox-session-a")
				) {
					callback(null, "created-a\n", "");
					return;
				}

				if (
					args[0] === "start" &&
					args[1] === "meridian-chat-sandbox-session-a"
				) {
					callback(null, "started-a\n", "");
					return;
				}

				if (args[0] === "rm" && args[2] === "meridian-chat-sandbox-session-a") {
					callback(null, "removed-a\n", "");
					return;
				}

				if (
					args[0] === "inspect" &&
					args[3] === "meridian-chat-sandbox-session-b"
				) {
					callback(
						Object.assign(new Error("No such container"), { code: 1 }),
						"",
						"No such container",
					);
					return;
				}

				if (
					args[0] === "create" &&
					args.includes("meridian-chat-sandbox-session-b")
				) {
					callback(null, "created-b\n", "");
					return;
				}

				if (
					args[0] === "start" &&
					args[1] === "meridian-chat-sandbox-session-b"
				) {
					callback(null, "started-b\n", "");
					return;
				}

				throw new Error(`Unexpected execFile args: ${args.join(" ")}`);
			},
		);

		await runtime.createSession("session-a");
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);

		const revivePromise = runtime.createSession("session-a");
		await vi.waitFor(() => {
			expect(reviveInspectCallback).toBeDefined();
		});

		const otherSessionPromise = runtime.createSession("session-b");
		await Promise.resolve();

		expect(
			childProcessMocks.execFile.mock.calls.filter(
				([, args]) =>
					args[0] === "rm" && args[2] === "meridian-chat-sandbox-session-a",
			),
		).toHaveLength(0);
		expect(childProcessMocks.execFile).toHaveBeenCalledTimes(4);

		reviveInspectCallback?.(null, "true\n", "");

		await expect(revivePromise).resolves.toEqual({
			id: "session-a",
			lastUsedAt: expect.any(Date),
		});
		await expect(otherSessionPromise).resolves.toEqual({
			id: "session-b",
			lastUsedAt: expect.any(Date),
		});
		expect(
			childProcessMocks.execFile.mock.calls.filter(
				([, args]) =>
					args[0] === "rm" && args[2] === "meridian-chat-sandbox-session-a",
			),
		).toHaveLength(0);
	});
});

function mockExecFileSequence(
	results: Array<{ exitCode: number; stderr?: string; stdout?: string }>,
) {
	childProcessMocks.execFile.mockImplementation(
		(
			_file: string,
			_args: string[],
			_options: { timeout: number },
			callback: (
				error: Error | NodeJS.ErrnoException | null,
				stdout: string,
				stderr: string,
			) => void,
		) => {
			const next = results.shift();
			if (!next) {
				throw new Error("Unexpected execFile call in test.");
			}

			if (next.exitCode === 0) {
				callback(null, next.stdout ?? "", next.stderr ?? "");
				return;
			}

			const error = Object.assign(new Error(next.stderr ?? "failed"), {
				code: next.exitCode,
			});
			callback(error, next.stdout ?? "", next.stderr ?? "");
		},
	);
}

function createMockChildProcess() {
	const child = new EventEmitter() as EventEmitter & {
		killed: boolean;
		kill: ReturnType<typeof vi.fn>;
		stdin: { end: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
		stderr: EventEmitter & { resume: ReturnType<typeof vi.fn> };
		stdout: EventEmitter & { resume: ReturnType<typeof vi.fn> };
		unref: ReturnType<typeof vi.fn>;
	};

	child.killed = false;
	child.kill = vi.fn(() => {
		child.killed = true;
	});
	child.stdin = {
		end: vi.fn(),
		write: vi.fn(),
	};
	child.stdout = Object.assign(new EventEmitter(), { resume: vi.fn() });
	child.stderr = Object.assign(new EventEmitter(), { resume: vi.fn() });
	child.unref = vi.fn();

	return child;
}
