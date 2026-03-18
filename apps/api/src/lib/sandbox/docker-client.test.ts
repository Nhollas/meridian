import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
	execFile: vi.fn(),
	spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
	spawn: childProcessMocks.spawn,
}));

import { createDockerClient } from "@/lib/sandbox/docker-client";
import { createTestConfig } from "../../../tests/support/test-config";

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

describe("createDockerClient", () => {
	beforeEach(() => {
		childProcessMocks.execFile.mockReset();
		childProcessMocks.spawn.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates a container with security options, mounts, and env vars", async () => {
		const client = createDockerClient(createTestConfig());
		mockExecFileSequence([{ exitCode: 0, stdout: "created\n" }]);

		await client.createContainer(
			"sandbox-session-1",
			"/tmp/sessions/s1",
			"session-1",
		);

		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"docker",
			expect.arrayContaining([
				"create",
				"--name",
				"sandbox-session-1",
				"--init",
				"--cap-drop",
				"ALL",
				"--security-opt",
				"no-new-privileges",
				"--memory",
				"2g",
				"--pids-limit",
				"512",
				"--label",
				"meridian.chat.session-id=session-1",
				"-v",
				"/tmp/sessions/s1:/sandbox-home",
				"meridian-chat-sandbox:local",
				"sleep",
				"infinity",
			]),
			{ timeout: 30000 },
			expect.any(Function),
		);
	});

	it("passes configured auth environment into container create args", async () => {
		const client = createDockerClient(
			createTestConfig({
				meridianAuthClientId: "meridian-cli",
				meridianAuthIssuer: "https://issuer.example.com",
			}),
		);
		mockExecFileSequence([{ exitCode: 0, stdout: "created\n" }]);

		await client.createContainer("sandbox-auth", "/tmp/sessions/auth", "auth");

		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
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

	it("mounts an extra CA bundle and forwards proxy environment", async () => {
		const client = createDockerClient(
			createTestConfig({
				extraCaCertsFile: "/Users/example/corp-root.pem",
				proxyEnv: {
					HTTPS_PROXY: "http://proxy.example.net:8080",
					NO_PROXY: "localhost,127.0.0.1",
				},
			}),
		);
		mockExecFileSequence([{ exitCode: 0, stdout: "created\n" }]);

		await client.createContainer(
			"sandbox-proxy",
			"/tmp/sessions/proxy",
			"proxy",
		);

		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
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

	it("parses container state from docker inspect output", async () => {
		const client = createDockerClient(createTestConfig());

		mockExecFileSequence([{ exitCode: 0, stdout: "true\n" }]);
		await expect(client.getContainerState("sandbox-1")).resolves.toBe(
			"running",
		);

		mockExecFileSequence([{ exitCode: 0, stdout: "false\n" }]);
		await expect(client.getContainerState("sandbox-2")).resolves.toBe(
			"stopped",
		);

		mockExecFileSequence([{ exitCode: 1, stderr: "No such container" }]);
		await expect(client.getContainerState("sandbox-3")).resolves.toBe(
			"missing",
		);
	});

	it("builds docker exec args with stdin flag when stdin is provided", async () => {
		const client = createDockerClient(createTestConfig());
		const child = createMockChildProcess();
		childProcessMocks.spawn.mockReturnValue(child);

		const resultPromise = client.exec("sandbox-stdin", ["cat"], {
			stdin: "payload",
		});
		await vi.waitFor(() => {
			expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
		});

		child.stdout.emit("data", Buffer.from("echoed"));
		child.emit("close", 0);

		await expect(resultPromise).resolves.toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "echoed",
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
				"sandbox-stdin",
				"cat",
			],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		expect(child.stdin.write).toHaveBeenCalledWith("payload");
		expect(child.stdin.end).toHaveBeenCalled();
	});

	it("builds docker exec args without stdin flag for regular commands", async () => {
		const client = createDockerClient(createTestConfig());
		mockExecFileSequence([{ exitCode: 0, stdout: "hello\n" }]);

		await client.exec("sandbox-regular", ["echo", "hello"]);

		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"docker",
			[
				"exec",
				"-w",
				"/sandbox-home",
				"-e",
				"HOME=/sandbox-home",
				"sandbox-regular",
				"echo",
				"hello",
			],
			{ timeout: 30000 },
			expect.any(Function),
		);
	});

	it("starts and removes containers via docker CLI", async () => {
		const client = createDockerClient(createTestConfig());

		mockExecFileSequence([{ exitCode: 0, stdout: "started\n" }]);
		await client.startContainer("sandbox-start");
		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"docker",
			["start", "sandbox-start"],
			{ timeout: 30000 },
			expect.any(Function),
		);

		mockExecFileSequence([{ exitCode: 0, stdout: "removed\n" }]);
		await client.removeContainer("sandbox-remove");
		expect(childProcessMocks.execFile).toHaveBeenCalledWith(
			"docker",
			["rm", "--force", "sandbox-remove"],
			{ timeout: 30000 },
			expect.any(Function),
		);
	});
});
