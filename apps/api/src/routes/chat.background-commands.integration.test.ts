import { describe, expect, it } from "vitest";
import {
	createChatRequest,
	getCompletedToolOutput,
	getParsedToolOutput,
} from "../../tests/support/chat-route";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolFailed,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTestChat } from "./chat.integration-support";

describe("POST /api/chat integration - background commands", () => {
	it("can start background work and do other useful work in the same turn", async () => {
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			yield toolStarted({
				id: "tool-1",
				input: {
					command: ["meridian", "auth", "login", "--json"],
					label: "Logging in",
				},
				name: "start_background_command",
			});
			const backgroundResult = await invokeTool(
				tools,
				"start_background_command",
				{
					command: ["meridian", "auth", "login", "--json"],
					label: "Logging in",
				},
			);
			yield toolCompleted({
				id: "tool-1",
				name: "start_background_command",
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

			yield assistantText(
				"Login started in the background. The schema fields are destination.",
			);
		});
		await using ctx = await createTestChat({
			createRunner,
			backgroundExecFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					result: {
						exitCode: null,
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
					},
					completion: new Promise(() => {}),
					stdout:
						'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n',
					stderr: "",
				},
			],
		});
		const { POST, collectTurnEvents, tmp } = ctx;

		await tmp.writeSessionFile(
			"session-background",
			"schema.json",
			'{"fields":["destination"]}',
		);

		const eventsPromise = collectTurnEvents("session-background");
		await POST(
			createChatRequest({
				message: "Log me in and check the schema",
				sessionId: "session-background",
			}),
		);
		const events = await eventsPromise;

		expect(getParsedToolOutput(events, "start_background_command")).toEqual({
			backgroundCommandId: expect.any(String),
			exitCode: null,
			status: "running",
			stderr: "",
			stdout: '{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
		});
		expect(getCompletedToolOutput(events, "read_file")).toBe(
			'{"fields":["destination"]}',
		);
		expect(events.at(-1)).toMatchObject({
			sessionId: "session-background",
			turnId: "turn-1",
			type: "turn.completed",
			payload: {
				content:
					"Login started in the background. The schema fields are destination.",
				toolCalls: [
					expect.objectContaining({
						id: "tool-1",
						name: "start_background_command",
						state: "completed",
					}),
					expect.objectContaining({
						id: "tool-2",
						name: "read_file",
						output: '{"fields":["destination"]}',
						state: "completed",
					}),
				],
			},
		});
	});

	it("lets a later turn inspect a background command started earlier in the same session", async () => {
		let resolveCompletion!: (result: {
			exitCode: number | null;
			stderr: string;
			stdout: string;
		}) => void;
		const completionPromise = new Promise<{
			exitCode: number | null;
			stderr: string;
			stdout: string;
		}>((resolve) => {
			resolveCompletion = resolve;
		});

		let capturedBgId = "";

		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			tools,
		}) {
			if (message === "Start login") {
				yield toolStarted({
					id: "tool-1",
					input: {
						command: ["meridian", "auth", "login", "--json"],
						label: "Logging in",
					},
					name: "start_background_command",
				});
				const output = await invokeTool(tools, "start_background_command", {
					command: ["meridian", "auth", "login", "--json"],
					label: "Logging in",
				});
				yield toolCompleted({
					id: "tool-1",
					name: "start_background_command",
					output,
				});

				const parsed = JSON.parse(String(output)) as {
					backgroundCommandId: string;
				};
				capturedBgId = parsed.backgroundCommandId;

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
				input: { commandId: capturedBgId },
				name: "inspect_background_command",
			});
			const inspectedCommand = await invokeTool(
				tools,
				"inspect_background_command",
				{ commandId: capturedBgId },
			);
			yield toolCompleted({
				id: "tool-3",
				name: "inspect_background_command",
				output: inspectedCommand,
			});

			// Resolve the background command
			resolveCompletion({
				exitCode: 0,
				stderr: "",
				stdout:
					'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
			});

			yield assistantText("Login is still running.");
		});
		await using ctx = await createTestChat({
			createRunner,
			backgroundExecFixtures: [
				{
					command: ["meridian", "auth", "login", "--json"],
					result: {
						exitCode: null,
						stderr: "",
						stdout:
							'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}',
					},
					completion: completionPromise,
					stdout:
						'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
					stderr: "",
				},
			],
		});
		const { POST, collectTurnEvents } = ctx;

		const startEventsPromise = collectTurnEvents("session-background");
		await POST(
			createChatRequest({
				message: "Start login",
				sessionId: "session-background",
			}),
		);
		const startTurn = await startEventsPromise;

		const followUpEventsPromise = collectTurnEvents("session-background");
		await POST(
			createChatRequest({
				message: "Check login",
				sessionId: "session-background",
			}),
		);
		const followUpTurn = await followUpEventsPromise;

		expect(getParsedToolOutput(startTurn, "start_background_command")).toEqual({
			backgroundCommandId: expect.any(String),
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
				id: expect.any(String),
				startedAt: expect.any(String),
				status: "running",
			},
		]);
		expect(
			getParsedToolOutput(followUpTurn, "inspect_background_command"),
		).toEqual({
			command: ["meridian", "auth", "login", "--json"],
			exitCode: null,
			id: expect.any(String),
			startedAt: expect.any(String),
			status: "running",
			stderr: "",
			stdout:
				'{"status":"pending","intervalSeconds":5,"userCode":"ABCD-1234"}\n{"status":"authenticated","user":"john.doe@example.com"}\n',
		});
		expect(followUpTurn.at(-1)).toMatchObject({
			sessionId: "session-background",
			turnId: "turn-2",
			type: "turn.completed",
			payload: {
				content: "Login is still running.",
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
				],
			},
		});
	});

	it("fails cleanly when background commands are missing", async () => {
		const createRunner = createScriptedAgentRunner(async function* ({ tools }) {
			for (const [id, name] of [
				["tool-1", "inspect_background_command"],
				["tool-2", "terminate_background_command"],
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
		await using ctx = await createTestChat({
			createRunner,
		});
		const { POST, collectTurnEvents } = ctx;

		const eventsPromise = collectTurnEvents("session-background");
		await POST(
			createChatRequest({
				message: "Inspect missing background work",
				sessionId: "session-background",
			}),
		);
		const events = await eventsPromise;

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
						name: "terminate_background_command",
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
						name: "terminate_background_command",
						output: "Unknown background command: missing-command",
					},
				},
			}),
			expect.objectContaining({
				sequence: 5,
				type: "assistant.delta",
				payload: {
					delta: "No live background command matched that ID.",
				},
			}),
			expect.objectContaining({
				sequence: 6,
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
		let capturedBgId = "";

		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			tools,
		}) {
			if (message === "Start server") {
				yield toolStarted({
					id: "tool-1",
					input: {
						command: ["meridian", "serve"],
						label: "Starting server",
					},
					name: "start_background_command",
				});
				const output = await invokeTool(tools, "start_background_command", {
					command: ["meridian", "serve"],
					label: "Starting server",
				});
				yield toolCompleted({
					id: "tool-1",
					name: "start_background_command",
					output,
				});

				const parsed = JSON.parse(String(output)) as {
					backgroundCommandId: string;
				};
				capturedBgId = parsed.backgroundCommandId;

				yield assistantText("Server started.");
				return;
			}

			yield toolStarted({
				id: "tool-2",
				input: { commandId: capturedBgId },
				name: "terminate_background_command",
			});
			const output = await invokeTool(tools, "terminate_background_command", {
				commandId: capturedBgId,
			});
			yield toolCompleted({
				id: "tool-2",
				name: "terminate_background_command",
				output,
			});
			yield assistantText("Server terminated.");
		});
		await using ctx = await createTestChat({
			createRunner,
			backgroundExecFixtures: [
				{
					command: ["meridian", "serve"],
					result: {
						exitCode: null,
						stderr: "",
						stdout: "Server booting",
					},
					stdout: "Server booting\n",
					stderr: "",
				},
			],
		});
		const { POST, collectTurnEvents } = ctx;

		const startEventsPromise = collectTurnEvents("session-background");
		await POST(
			createChatRequest({
				message: "Start server",
				sessionId: "session-background",
			}),
		);
		await startEventsPromise;

		const terminateEventsPromise = collectTurnEvents("session-background");
		await POST(
			createChatRequest({
				message: "Stop server",
				sessionId: "session-background",
			}),
		);
		const terminateTurn = await terminateEventsPromise;

		expect(
			getParsedToolOutput(terminateTurn, "terminate_background_command"),
		).toEqual({
			command: ["meridian", "serve"],
			endedAt: expect.any(String),
			exitCode: 137,
			id: expect.any(String),
			startedAt: expect.any(String),
			status: "terminated",
			stderr: "",
			stdout: "Server booting\n",
		});
		expect(terminateTurn.at(-1)).toMatchObject({
			sessionId: "session-background",
			turnId: "turn-2",
			type: "turn.completed",
			payload: {
				content: "Server terminated.",
				toolCalls: [
					expect.objectContaining({
						id: "tool-2",
						name: "terminate_background_command",
						state: "completed",
					}),
				],
			},
		});
	});
});
