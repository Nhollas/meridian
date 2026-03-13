import { describe, expect, it } from "vitest";
import {
	createChatRequest,
	getCompletedToolOutput,
	getParsedToolOutput,
	readRuntimeEvents,
} from "../../tests/support/chat-route";
import { createInMemorySandboxRuntime } from "../../tests/support/in-memory-runtime";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolFailed,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTestPost } from "./chat.integration-support";

describe("POST /api/chat integration - background commands", () => {
	it("can start background work, do other useful work, then resume it in the same turn", async () => {
		const runtime = createInMemorySandboxRuntime({
			backgroundCommands: {
				"bg-1": {
					current: {
						command: ["meridian", "auth", "login", "--json"],
						exitCode: null,
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "running",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n',
					},
					waitResult: {
						command: ["meridian", "auth", "login", "--json"],
						endedAt: "2026-03-11T12:00:05.000Z",
						exitCode: 0,
						id: "bg-1",
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "completed",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
					},
				},
			},
			commandFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					options: {
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
					result: {
						backgroundCommandId: "bg-1",
						exitCode: null,
						status: "running",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
					},
				},
			],
			files: {
				"schema.json": '{"fields":["destination"]}',
			},
		});
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: {
					command: ["meridian", "auth", "login", "--json"],
					keepAlive: true,
					waitFor: "first-stdout-line",
				},
				name: "run_command",
			});
			const backgroundResult = await invokeTool(tools, "run_command", {
				command: ["meridian", "auth", "login", "--json"],
				keepAlive: true,
				waitFor: "first-stdout-line",
			});
			yield toolCompleted({
				id: "tool-1",
				name: "run_command",
				output: backgroundResult,
			});

			yield toolStarted({
				id: "tool-2",
				input: { path: "schema.json" },
				name: "read_file",
			});
			const schemaContents = await invokeTool(tools, "read_file", {
				path: "schema.json",
			});
			yield toolCompleted({
				id: "tool-2",
				name: "read_file",
				output: schemaContents,
			});

			yield toolStarted({
				id: "tool-3",
				input: { commandId: "bg-1" },
				name: "wait_for_background_command",
			});
			const completedCommand = await invokeTool(
				tools,
				"wait_for_background_command",
				{ commandId: "bg-1" },
			);
			yield toolCompleted({
				id: "tool-3",
				name: "wait_for_background_command",
				output: completedCommand,
			});

			yield assistantText(
				"Login completed, and I confirmed the schema fields are destination.",
			);
		});
		const POST = createTestPost({ createRunner, runtime });

		const events = await readRuntimeEvents(
			await POST(
				createChatRequest({
					message: "Log me in and check the schema",
					sessionId: "session-background",
				}),
			),
		);

		expect(getParsedToolOutput(events, "run_command")).toEqual({
			backgroundCommandId: "bg-1",
			exitCode: null,
			status: "running",
			stderr: "",
			stdout: '{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
		});
		expect(getCompletedToolOutput(events, "read_file")).toBe(
			'{"fields":["destination"]}',
		);
		expect(getParsedToolOutput(events, "wait_for_background_command")).toEqual({
			command: ["meridian", "auth", "login", "--json"],
			endedAt: "2026-03-11T12:00:05.000Z",
			exitCode: 0,
			id: "bg-1",
			startedAt: "2026-03-11T12:00:00.000Z",
			status: "completed",
			stderr: "",
			stdout:
				'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
		});
		expect(events.at(-1)).toMatchObject({
			sessionId: "session-background",
			turnId: "turn-1",
			type: "turn.completed",
			payload: {
				content:
					"Login completed, and I confirmed the schema fields are destination.",
				toolCalls: [
					expect.objectContaining({
						id: "tool-1",
						name: "run_command",
						state: "completed",
					}),
					expect.objectContaining({
						id: "tool-2",
						name: "read_file",
						output: '{"fields":["destination"]}',
						state: "completed",
					}),
					expect.objectContaining({
						id: "tool-3",
						name: "wait_for_background_command",
						state: "completed",
					}),
				],
			},
		});
	});

	it("lets a later turn inspect and wait on a background command started earlier in the same session", async () => {
		const runtime = createInMemorySandboxRuntime({
			backgroundCommands: {
				"bg-1": {
					current: {
						command: ["meridian", "auth", "login", "--json"],
						exitCode: null,
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "running",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n',
					},
					waitResult: {
						command: ["meridian", "auth", "login", "--json"],
						endedAt: "2026-03-11T12:00:05.000Z",
						exitCode: 0,
						id: "bg-1",
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "completed",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
					},
				},
			},
			commandFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					options: {
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
					result: {
						backgroundCommandId: "bg-1",
						exitCode: null,
						status: "running",
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
					},
				},
			],
		});
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			tools,
		}) {
			if (message === "Start login") {
				yield toolStarted({
					id: "tool-1",
					input: {
						command: ["meridian", "auth", "login", "--json"],
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
					name: "run_command",
				});
				const output = await invokeTool(tools, "run_command", {
					command: ["meridian", "auth", "login", "--json"],
					keepAlive: true,
					waitFor: "first-stdout-line",
				});
				yield toolCompleted({
					id: "tool-1",
					name: "run_command",
					output,
				});
				yield assistantText("Login started in the background.");
				return;
			}

			yield toolStarted({
				id: "tool-2",
				input: {},
				name: "list_background_commands",
			});
			const backgroundCommands = await invokeTool(
				tools,
				"list_background_commands",
				{},
			);
			yield toolCompleted({
				id: "tool-2",
				name: "list_background_commands",
				output: backgroundCommands,
			});

			yield toolStarted({
				id: "tool-3",
				input: { commandId: "bg-1" },
				name: "inspect_background_command",
			});
			const inspectedCommand = await invokeTool(
				tools,
				"inspect_background_command",
				{ commandId: "bg-1" },
			);
			yield toolCompleted({
				id: "tool-3",
				name: "inspect_background_command",
				output: inspectedCommand,
			});

			yield toolStarted({
				id: "tool-4",
				input: { commandId: "bg-1" },
				name: "wait_for_background_command",
			});
			const completedCommand = await invokeTool(
				tools,
				"wait_for_background_command",
				{ commandId: "bg-1" },
			);
			yield toolCompleted({
				id: "tool-4",
				name: "wait_for_background_command",
				output: completedCommand,
			});

			yield assistantText("Login completed.");
		});
		const POST = createTestPost({ createRunner, runtime });

		const startTurn = await readRuntimeEvents(
			await POST(
				createChatRequest({
					message: "Start login",
					sessionId: "session-background",
				}),
			),
		);
		const followUpTurn = await readRuntimeEvents(
			await POST(
				createChatRequest({
					message: "Check login",
					sessionId: "session-background",
				}),
			),
		);

		expect(getParsedToolOutput(startTurn, "run_command")).toEqual({
			backgroundCommandId: "bg-1",
			exitCode: null,
			status: "running",
			stderr: "",
			stdout: '{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
		});
		expect(
			getParsedToolOutput(followUpTurn, "list_background_commands"),
		).toEqual([
			{
				command: ["meridian", "auth", "login", "--json"],
				exitCode: null,
				id: "bg-1",
				startedAt: "2026-03-11T12:00:00.000Z",
				status: "running",
			},
		]);
		expect(
			getParsedToolOutput(followUpTurn, "inspect_background_command"),
		).toEqual({
			command: ["meridian", "auth", "login", "--json"],
			exitCode: null,
			id: "bg-1",
			startedAt: "2026-03-11T12:00:00.000Z",
			status: "running",
			stderr: "",
			stdout:
				'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n',
		});
		expect(
			getParsedToolOutput(followUpTurn, "wait_for_background_command"),
		).toEqual({
			command: ["meridian", "auth", "login", "--json"],
			endedAt: "2026-03-11T12:00:05.000Z",
			exitCode: 0,
			id: "bg-1",
			startedAt: "2026-03-11T12:00:00.000Z",
			status: "completed",
			stderr: "",
			stdout:
				'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
		});
		expect(followUpTurn.at(-1)).toMatchObject({
			sessionId: "session-background",
			turnId: "turn-2",
			type: "turn.completed",
			payload: {
				content: "Login completed.",
				toolCalls: [
					expect.objectContaining({
						id: "tool-2",
						name: "list_background_commands",
						state: "completed",
					}),
					expect.objectContaining({
						id: "tool-3",
						name: "inspect_background_command",
						state: "completed",
					}),
					expect.objectContaining({
						id: "tool-4",
						name: "wait_for_background_command",
						state: "completed",
					}),
				],
			},
		});
		expect(runtime.calls).toEqual([
			{
				args: [
					["meridian", "auth", "login", "--json"],
					{
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
				],
				method: "runCommand",
				sessionId: "session-background",
			},
			{
				args: [],
				method: "listBackgroundCommands",
				sessionId: "session-background",
			},
			{
				args: ["bg-1"],
				method: "getBackgroundCommand",
				sessionId: "session-background",
			},
			{
				args: ["bg-1", undefined],
				method: "waitForBackgroundCommand",
				sessionId: "session-background",
			},
		]);
	});

	it("fails cleanly when background commands are missing", async () => {
		const runtime = createInMemorySandboxRuntime();
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			for (const [id, name] of [
				["tool-1", "inspect_background_command"],
				["tool-2", "wait_for_background_command"],
				["tool-3", "terminate_background_command"],
			] as const) {
				yield toolStarted({
					id,
					input: { commandId: "missing-command" },
					name,
				});
				try {
					const output = await invokeTool(tools, name, {
						commandId: "missing-command",
					});
					yield toolCompleted({
						id,
						name,
						output,
					});
				} catch (error) {
					yield toolFailed({
						error: error instanceof Error ? error.message : String(error),
						id,
						name,
					});
				}
			}

			yield assistantText("No live background command matched that ID.");
		});
		const POST = createTestPost({ createRunner, runtime });

		const events = await readRuntimeEvents(
			await POST(
				createChatRequest({
					message: "Inspect missing background work",
					sessionId: "session-background",
				}),
			),
		);

		expect(events).toEqual([
			expect.objectContaining({
				sequence: 1,
				type: "tool.started",
				payload: {
					toolCall: {
						id: "tool-1",
						input: '{"commandId":"missing-command"}',
						name: "inspect_background_command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 2,
				type: "tool.failed",
				payload: {
					toolCall: {
						id: "tool-1",
						input: '{"commandId":"missing-command"}',
						name: "inspect_background_command",
						output: "Unknown background command: missing-command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 3,
				type: "tool.started",
				payload: {
					toolCall: {
						id: "tool-2",
						input: '{"commandId":"missing-command"}',
						name: "wait_for_background_command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 4,
				type: "tool.failed",
				payload: {
					toolCall: {
						id: "tool-2",
						input: '{"commandId":"missing-command"}',
						name: "wait_for_background_command",
						output: "Unknown background command: missing-command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 5,
				type: "tool.started",
				payload: {
					toolCall: {
						id: "tool-3",
						input: '{"commandId":"missing-command"}',
						name: "terminate_background_command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 6,
				type: "tool.failed",
				payload: {
					toolCall: {
						id: "tool-3",
						input: '{"commandId":"missing-command"}',
						name: "terminate_background_command",
						output: "Unknown background command: missing-command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 7,
				type: "assistant.delta",
				payload: {
					delta: "No live background command matched that ID.",
				},
			}),
			expect.objectContaining({
				sequence: 8,
				type: "turn.completed",
				payload: {
					content: "No live background command matched that ID.",
					toolCalls: [
						{
							id: "tool-1",
							input: '{"commandId":"missing-command"}',
							name: "inspect_background_command",
							output: "Unknown background command: missing-command",
							state: "failed",
						},
						{
							id: "tool-2",
							input: '{"commandId":"missing-command"}',
							name: "wait_for_background_command",
							output: "Unknown background command: missing-command",
							state: "failed",
						},
						{
							id: "tool-3",
							input: '{"commandId":"missing-command"}',
							name: "terminate_background_command",
							output: "Unknown background command: missing-command",
							state: "failed",
						},
					],
				},
			}),
		]);
	});

	it("surfaces termination of a running background command", async () => {
		const runtime = createInMemorySandboxRuntime({
			backgroundCommands: {
				"bg-terminate": {
					current: {
						command: ["meridian", "serve"],
						exitCode: null,
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "running",
						stderr: "",
						stdout: "Server booting\n",
					},
					terminateResult: {
						command: ["meridian", "serve"],
						endedAt: "2026-03-11T12:00:07.000Z",
						exitCode: null,
						id: "bg-terminate",
						startedAt: "2026-03-11T12:00:00.000Z",
						status: "terminated",
						stderr: "",
						stdout: "Server booting\nTerminated by user\n",
					},
				},
			},
			commandFixtures: [
				{
					command: ["meridian", "serve"],
					options: {
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
					result: {
						backgroundCommandId: "bg-terminate",
						exitCode: null,
						status: "running",
						stderr: "",
						stdout: "Server booting",
					},
				},
			],
		});
		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			tools,
		}) {
			if (message === "Start server") {
				yield toolStarted({
					id: "tool-1",
					input: {
						command: ["meridian", "serve"],
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
					name: "run_command",
				});
				const output = await invokeTool(tools, "run_command", {
					command: ["meridian", "serve"],
					keepAlive: true,
					waitFor: "first-stdout-line",
				});
				yield toolCompleted({
					id: "tool-1",
					name: "run_command",
					output,
				});
				yield assistantText("Server started.");
				return;
			}

			yield toolStarted({
				id: "tool-2",
				input: { commandId: "bg-terminate" },
				name: "terminate_background_command",
			});
			const output = await invokeTool(tools, "terminate_background_command", {
				commandId: "bg-terminate",
			});
			yield toolCompleted({
				id: "tool-2",
				name: "terminate_background_command",
				output,
			});
			yield assistantText("Server terminated.");
		});
		const POST = createTestPost({ createRunner, runtime });

		await POST(
			createChatRequest({
				message: "Start server",
				sessionId: "session-background",
			}),
		);
		const terminateTurn = await readRuntimeEvents(
			await POST(
				createChatRequest({
					message: "Stop server",
					sessionId: "session-background",
				}),
			),
		);

		expect(
			getParsedToolOutput(terminateTurn, "terminate_background_command"),
		).toEqual({
			command: ["meridian", "serve"],
			endedAt: "2026-03-11T12:00:07.000Z",
			exitCode: null,
			id: "bg-terminate",
			startedAt: "2026-03-11T12:00:00.000Z",
			status: "terminated",
			stderr: "",
			stdout: "Server booting\nTerminated by user\n",
		});
		expect(terminateTurn.at(-1)).toMatchObject({
			sessionId: "session-background",
			turnId: "turn-2",
			type: "turn.completed",
			payload: {
				content: "Server terminated.",
				toolCalls: [
					{
						id: "tool-2",
						input: '{"commandId":"bg-terminate"}',
						name: "terminate_background_command",
						output:
							'{"command":["meridian","serve"],"exitCode":null,"endedAt":"2026-03-11T12:00:07.000Z","id":"bg-terminate","startedAt":"2026-03-11T12:00:00.000Z","status":"terminated","stderr":"","stdout":"Server booting\\nTerminated by user\\n"}',
						state: "completed",
					},
				],
			},
		});
		expect(runtime.calls).toEqual([
			{
				args: [
					["meridian", "serve"],
					{
						keepAlive: true,
						waitFor: "first-stdout-line",
					},
				],
				method: "runCommand",
				sessionId: "session-background",
			},
			{
				args: ["bg-terminate"],
				method: "terminateBackgroundCommand",
				sessionId: "session-background",
			},
		]);
	});
});
