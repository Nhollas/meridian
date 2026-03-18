import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDockerRuntime } from "@/lib/sandbox/docker-runtime";
import { assertDefined } from "../../../tests/support/assertions";
import { createFakeDockerClient } from "../../../tests/support/fake-docker-client";
import { createTempSessionDir } from "../../../tests/support/temp-session-dir";
import { createTestConfig } from "../../../tests/support/test-config";

describe("createDockerRuntime", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("creates and starts a container via the client on first use", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient({
			execFixtures: [
				{
					command: ["echo", "hello"],
					result: { exitCode: 0, stderr: "", stdout: "hello from sandbox\n" },
				},
			],
		});
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		const result = await runtime.runCommand("session-123", ["echo", "hello"]);

		expect(result).toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "hello from sandbox\n",
		});
		expect(client.calls).toEqual([
			{
				args: ["meridian-chat-sandbox-session-123"],
				method: "getContainerState",
			},
			{
				args: [
					"meridian-chat-sandbox-session-123",
					expect.stringContaining("/session-123"),
					"session-123",
				],
				method: "createContainer",
			},
			{ args: ["meridian-chat-sandbox-session-123"], method: "startContainer" },
			{
				args: [
					"meridian-chat-sandbox-session-123",
					["echo", "hello"],
					{ timeoutMs: 30000, waitFor: "exit" },
				],
				method: "exec",
			},
		]);
	});

	it("creates the session directory on disk", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		await runtime.createSession("session-dir-test");

		const stat = await import("node:fs/promises").then((fs) =>
			fs.stat(join(tmp.rootDirectory, "session-dir-test")),
		);
		expect(stat.isDirectory()).toBe(true);
	});

	it("reaps expired idle sessions after the TTL", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		await runtime.createSession("old-session");
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		await runtime.createSession("new-session");

		expect(client.calls.filter((c) => c.method === "removeContainer")).toEqual([
			{
				args: ["meridian-chat-sandbox-old-session"],
				method: "removeContainer",
			},
		]);
	});

	it("reads runtime instructions from the configured file", async () => {
		await using tmp = await createTempSessionDir();
		const instructionsFile = join(tmp.rootDirectory, "instructions.txt");
		await writeFile(instructionsFile, "Use the configured instructions.\n");

		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({
				instructionsFile,
				rootDirectory: tmp.rootDirectory,
			}),
			{ client },
		);

		const instructions = await runtime.getInstructions("session-instructions");

		expect(instructions).toBe("Use the configured instructions.\n");
	});

	it("serializes concurrent container setup for the same session", async () => {
		await using tmp = await createTempSessionDir();
		let resolveFirstInspect:
			| ((state: "missing" | "running" | "stopped") => void)
			| undefined;
		const client = createFakeDockerClient();
		let inspectCount = 0;

		const originalGetContainerState = client.getContainerState.bind(client);
		client.getContainerState = async (containerName) => {
			inspectCount++;
			if (
				containerName === "meridian-chat-sandbox-race" &&
				inspectCount === 1
			) {
				return new Promise((resolve) => {
					resolveFirstInspect = resolve;
				});
			}
			return originalGetContainerState(containerName);
		};

		client.exec = async (_containerName, command) => {
			const cmd = command.at(-1);
			return { exitCode: 0, stderr: "", stdout: `${cmd}\n` };
		};

		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		const firstRun = runtime.runCommand("race", ["echo", "one"]);
		await vi.waitFor(() => {
			expect(inspectCount).toBe(1);
		});

		const secondRun = runtime.runCommand("race", ["echo", "two"]);
		await Promise.resolve();
		expect(inspectCount).toBe(1);

		resolveFirstInspect?.("missing");

		await expect(firstRun).resolves.toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "one\n",
		});
		await expect(secondRun).resolves.toEqual({
			exitCode: 0,
			stderr: "",
			stdout: "two\n",
		});
	});

	it("writes and reads session files on the real filesystem", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		const relativePath = await runtime.writeSessionFile(
			"session-files",
			"requests/travel.json",
			'{"destination":"Greece"}\n',
		);

		expect(relativePath).toBe("requests/travel.json");

		const onDisk = await readFile(
			join(tmp.rootDirectory, "session-files", "requests", "travel.json"),
			"utf8",
		);
		expect(onDisk).toBe('{"destination":"Greece"}\n');

		const readBack = await runtime.readSessionFile(
			"session-files",
			"requests/travel.json",
		);
		expect(readBack).toBe('{"destination":"Greece"}\n');
	});

	it("lists session files from the real filesystem", async () => {
		await using tmp = await createTempSessionDir();
		await tmp.writeSessionFile("session-list", "alpha.txt", "a");
		await tmp.writeSessionFile("session-list", "beta.txt", "b");

		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		const files = await runtime.listSessionFiles("session-list");

		expect(files).toEqual(
			expect.arrayContaining([
				{ name: "alpha.txt", path: "alpha.txt", type: "file" },
				{ name: "beta.txt", path: "beta.txt", type: "file" },
			]),
		);
	});

	it("rejects file paths that escape the session directory", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		await expect(
			runtime.readSessionFile("session-escape", "../../etc/passwd"),
		).rejects.toThrow(
			"Session file path escapes the sandbox session directory.",
		);
	});

	it("deletes session files from the real filesystem", async () => {
		await using tmp = await createTempSessionDir();
		await tmp.writeSessionFile("session-delete", "temp.txt", "temporary");

		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		await runtime.deleteSessionFile("session-delete", "temp.txt");

		await expect(
			readFile(join(tmp.rootDirectory, "session-delete", "temp.txt"), "utf8"),
		).rejects.toThrow();
	});

	it("does not reap an expired session while a background command is running", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient({
			backgroundExecFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					result: {
						exitCode: null,
						stderr: "",
						stdout: '{"status":"pending","userCode":"ABCD-1234"}',
					},
				},
			],
		});
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		const result = await runtime.runCommand(
			"session-busy",
			["meridian", "auth", "login", "--json"],
			{ keepAlive: true, waitFor: "first-stdout-line" },
		);
		expect(result.backgroundCommandId).toBeDefined();

		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		await runtime.createSession("session-fresh");

		expect(
			client.calls.filter(
				(c) =>
					c.method === "removeContainer" &&
					(c.args[0] as string).includes("session-busy"),
			),
		).toHaveLength(0);
	});

	it("tracks background commands through their lifecycle", async () => {
		await using tmp = await createTempSessionDir();
		let resolveCompletion = (_result: {
			exitCode: number;
			stderr: string;
			stdout: string;
		}) => {};
		const completion = new Promise<{
			exitCode: number;
			stderr: string;
			stdout: string;
		}>((resolve) => {
			resolveCompletion = resolve;
		});

		const client = createFakeDockerClient({
			backgroundExecFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					completion,
					result: {
						exitCode: null,
						stderr: "",
						stdout: '{"status":"pending","userCode":"ABCD-1234"}',
					},
					stdout:
						'{"status":"pending","userCode":"ABCD-1234"}\n{"status":"authenticated"}\n',
				},
			],
		});
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		const result = await runtime.runCommand(
			"session-bg",
			["meridian", "auth", "login", "--json"],
			{ keepAlive: true, waitFor: "first-stdout-line" },
		);

		expect(result).toEqual({
			backgroundCommandId: expect.any(String),
			exitCode: null,
			status: "running",
			stderr: "",
			stdout: '{"status":"pending","userCode":"ABCD-1234"}',
		});

		const backgroundCommandId = result.backgroundCommandId;
		assertDefined(backgroundCommandId);

		await expect(runtime.listBackgroundCommands("session-bg")).resolves.toEqual(
			[
				{
					command: ["meridian", "auth", "login", "--json"],
					exitCode: null,
					id: backgroundCommandId,
					startedAt: expect.any(String),
					status: "running",
				},
			],
		);

		resolveCompletion({ exitCode: 0, stderr: "", stdout: "done" });

		await expect(
			runtime.waitForBackgroundCommand("session-bg", backgroundCommandId),
		).resolves.toEqual({
			command: ["meridian", "auth", "login", "--json"],
			endedAt: expect.any(String),
			exitCode: 0,
			id: backgroundCommandId,
			startedAt: expect.any(String),
			status: "completed",
			stderr: "",
			stdout: expect.any(String),
		});
	});

	it("returns completed status when terminating an already-finished background command", async () => {
		await using tmp = await createTempSessionDir();
		let resolveCompletion = (_result: {
			exitCode: number;
			stderr: string;
			stdout: string;
		}) => {};
		const completion = new Promise<{
			exitCode: number;
			stderr: string;
			stdout: string;
		}>((resolve) => {
			resolveCompletion = resolve;
		});

		const client = createFakeDockerClient({
			backgroundExecFixtures: [
				{
					command: ["some-task"],
					completion,
					result: {
						exitCode: null,
						stderr: "",
						stdout: "started",
					},
					stdout: "task output\n",
				},
			],
		});
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		const result = await runtime.runCommand("session-term", ["some-task"], {
			keepAlive: true,
			waitFor: "first-stdout-line",
		});
		const backgroundCommandId = result.backgroundCommandId;
		assertDefined(backgroundCommandId);

		resolveCompletion({ exitCode: 0, stderr: "", stdout: "task output\n" });
		await runtime.waitForBackgroundCommand("session-term", backgroundCommandId);

		const snapshot = await runtime.terminateBackgroundCommand(
			"session-term",
			backgroundCommandId,
		);

		expect(snapshot).toEqual({
			command: ["some-task"],
			endedAt: expect.any(String),
			exitCode: 0,
			id: backgroundCommandId,
			startedAt: expect.any(String),
			status: "completed",
			stderr: "",
			stdout: "task output\n",
		});
	});

	it("destroys session resources including container and files", async () => {
		await using tmp = await createTempSessionDir();
		const client = createFakeDockerClient();
		const runtime = createDockerRuntime(
			createTestConfig({ rootDirectory: tmp.rootDirectory }),
			{ client },
		);

		await runtime.createSession("session-destroy");
		await runtime.writeSessionFile("session-destroy", "file.txt", "content");

		await runtime.destroySession("session-destroy");

		expect(client.calls.filter((c) => c.method === "removeContainer")).toEqual([
			{
				args: ["meridian-chat-sandbox-session-destroy"],
				method: "removeContainer",
			},
		]);

		const { stat } = await import("node:fs/promises");
		await expect(
			stat(join(tmp.rootDirectory, "session-destroy")),
		).rejects.toThrow();
	});
});
