import { http } from "msw";
import { describe } from "vitest";
import {
	createChatAcceptedResponse,
	createChatEventFactory,
} from "../../tests/support/chat-contract";
import { test } from "../../tests/support/chat-page-fixture";
import { browserWorker, withJsonBody } from "../../tests/support/msw";

/**
 * Realistic journey tests that exercise the chat UI with multi-tool-call
 * scenarios matching actual agent behaviour. These use representative tool
 * call patterns from real broadband and travel comparison sessions.
 */

describe("Chat UI - broadband comparison journey", () => {
	test("renders a multi-turn broadband comparison with mixed tool types", async ({
		chatPage,
		sseStream,
	}) => {
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Help me compare broadband" }, () => {
					setTimeout(() => {
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-1",
									input: "{}",
									name: "get_runtime_instructions",
									output: "The meridian CLI is installed.",
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-2",
									input: '{"command":["meridian","--help"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"Usage: meridian <command> [options]\\n\\nCommands:\\n  auth, products, proposals, results\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-3",
									input:
										'{"command":["meridian","auth","status","--json"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"{\\"authenticated\\": false}\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-4",
									input:
										'{"command":["meridian","auth","login","--json"],"waitFor":"first-stdout-line","keepAlive":true}',
									name: "run_command",
									output:
										'{"exitCode":null,"stderr":"","stdout":"{\\"user_code\\":\\"ABCD-EFGH\\",\\"status\\":\\"pending\\"}","backgroundCommandId":"bg-1","status":"running"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-5",
									input:
										'{"command":["meridian","product-schemas","get","--product","broadband","--version","1.0","--json"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"{\\"type\\":\\"object\\",\\"required\\":[\\"emailAddress\\",\\"data\\"]}\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("turn.completed", {
								content:
									"To compare broadband, I need your **email address** and **postcode**.\n\nPlease sign in first:\n- Code: **ABCD-EFGH**",
								toolCalls: [
									{
										id: "tc-1",
										input: "{}",
										name: "get_runtime_instructions",
										output: "The meridian CLI is installed.",
										state: "completed",
									},
									{
										id: "tc-2",
										input:
											'{"command":["meridian","--help"],"timeoutMs":120000}',
										name: "run_command",
										output:
											'{"exitCode":0,"stderr":"","stdout":"Usage: meridian <command> [options]\\n"}',
										state: "completed",
									},
									{
										id: "tc-3",
										input:
											'{"command":["meridian","auth","status","--json"],"timeoutMs":120000}',
										name: "run_command",
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"authenticated\\": false}\\n"}',
										state: "completed",
									},
									{
										id: "tc-4",
										input:
											'{"command":["meridian","auth","login","--json"],"waitFor":"first-stdout-line","keepAlive":true}',
										name: "run_command",
										output:
											'{"exitCode":null,"stderr":"","stdout":"{\\"user_code\\":\\"ABCD-EFGH\\",\\"status\\":\\"pending\\"}","backgroundCommandId":"bg-1","status":"running"}',
										state: "completed",
									},
									{
										id: "tc-5",
										input:
											'{"command":["meridian","product-schemas","get","--product","broadband","--version","1.0","--json"],"timeoutMs":120000}',
										name: "run_command",
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"type\\":\\"object\\"}\\n"}',
										state: "completed",
									},
								],
							}),
						);
					});
					return createChatAcceptedResponse("turn-123");
				}),
			),
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "test@test.com, PE9 UUU" }, () => {
					setTimeout(() => {
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-6",
									input:
										'{"command":["meridian","auth","status","--json"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"{\\"authenticated\\": true}\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-7",
									input: '{"commandId":"bg-1"}',
									name: "inspect_background_command",
									output:
										'{"command":["meridian","auth","login","--json"],"exitCode":0,"status":"completed"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-8",
									input:
										'{"path":"broadband-request.json","contents":"{\\"emailAddress\\":\\"test@test.com\\",\\"data\\":{\\"postcode\\":\\"PE9 UUU\\"}}"}',
									name: "write_file",
									output: '{"path":"broadband-request.json"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-9",
									input:
										'{"command":["meridian","proposal-requests","create","--product","broadband","--version","1.0","--file","broadband-request.json","--json"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"pr-abc123\\",\\"status\\":\\"draft\\"}\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-10",
									input:
										'{"command":["meridian","proposals","create","--proposal-request","pr-abc123","--json"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"prop-xyz\\",\\"status\\":\\"completed\\"}\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-11",
									input:
										'{"command":["meridian","results","get","--proposal","prop-xyz","--json"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"{\\"offerings\\":[{\\"providerName\\":\\"TalkTalk\\",\\"brandName\\":\\"Fibre 65\\"}]}\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("turn.completed", {
								content:
									"Here are your broadband results:\n\n| Provider | Package | Speed | Monthly |\n|---|---|---:|---:|\n| TalkTalk | Fibre 65 | 67Mbps | £26.00 |",
								toolCalls: [
									{
										id: "tc-6",
										name: "run_command",
										input: '{"command":["meridian","auth","status","--json"]}',
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"authenticated\\": true}\\n"}',
										state: "completed",
									},
									{
										id: "tc-7",
										name: "inspect_background_command",
										input: '{"commandId":"bg-1"}',
										output:
											'{"command":["meridian","auth","login"],"exitCode":0,"status":"completed"}',
										state: "completed",
									},
									{
										id: "tc-8",
										name: "write_file",
										input: '{"path":"broadband-request.json","contents":"{}"}',
										output: '{"path":"broadband-request.json"}',
										state: "completed",
									},
									{
										id: "tc-9",
										name: "run_command",
										input:
											'{"command":["meridian","proposal-requests","create","--product","broadband","--version","1.0","--file","broadband-request.json","--json"]}',
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"pr-abc123\\"}\\n"}',
										state: "completed",
									},
									{
										id: "tc-10",
										name: "run_command",
										input:
											'{"command":["meridian","proposals","create","--proposal-request","pr-abc123","--json"]}',
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"prop-xyz\\"}\\n"}',
										state: "completed",
									},
									{
										id: "tc-11",
										name: "run_command",
										input:
											'{"command":["meridian","results","get","--proposal","prop-xyz","--json"]}',
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"offerings\\":[]}\\n"}',
										state: "completed",
									},
								],
							}),
						);
					});
					return createChatAcceptedResponse("turn-123");
				}),
			),
		);

		// Turn 1: user asks for broadband comparison
		await chatPage.sendMessage("Help me compare broadband");
		await chatPage.expectUserMessage("Help me compare broadband");

		// Agent responds with instructions after running multiple tools
		await chatPage.expectAssistantResponse("email address");
		await chatPage.expectToolActivityVisible(
			"Loaded instructions, ran 4 commands",
		);

		// Turn 2: user provides details
		await chatPage.sendMessage("test@test.com, PE9 UUU");
		await chatPage.expectUserMessage("test@test.com, PE9 UUU");

		// Agent runs auth check, inspects background process, writes file, runs comparison
		await chatPage.expectAssistantResponse("broadband results");
		await chatPage.expectToolActivityVisible(
			"Ran 4 commands, inspected a process, wrote a file",
		);
	});
});

describe("Chat UI - travel insurance journey", () => {
	test("renders a travel comparison with write_file and markdown response", async ({
		chatPage,
		sseStream,
	}) => {
		const eventFactory = createChatEventFactory();

		browserWorker.use(
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody({ message: "Help me compare travel insurance" }, () => {
					setTimeout(() => {
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-1",
									input: "{}",
									name: "get_runtime_instructions",
									output: "The meridian CLI is installed.",
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("tool.completed", {
								toolCall: {
									id: "tc-2",
									input:
										'{"command":["meridian","auth","status","--json"],"timeoutMs":120000}',
									name: "run_command",
									output:
										'{"exitCode":0,"stderr":"","stdout":"{\\"authenticated\\": true}\\n"}',
								},
							}),
						);
						sseStream.emit(
							eventFactory.create("turn.completed", {
								content:
									"I can compare travel insurance. I need:\n- **Email address**\n- **Destination**\n- **Departure and return dates**\n- **Number of adults and children**",
								toolCalls: [
									{
										id: "tc-1",
										input: "{}",
										name: "get_runtime_instructions",
										output: "The meridian CLI is installed.",
										state: "completed",
									},
									{
										id: "tc-2",
										input: '{"command":["meridian","auth","status","--json"]}',
										name: "run_command",
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"authenticated\\": true}\\n"}',
										state: "completed",
									},
								],
							}),
						);
					});
					return createChatAcceptedResponse("turn-123");
				}),
			),
			http.post(
				"http://localhost:3201/api/chat",
				withJsonBody(
					{
						message:
							"Email: tester@email.org, Greece, 1st April 2026, 7 nights, 2 adults",
					},
					() => {
						setTimeout(() => {
							sseStream.emit(
								eventFactory.create("tool.completed", {
									toolCall: {
										id: "tc-3",
										input:
											'{"path":"travel-request.json","contents":"{\\"emailAddress\\":\\"tester@email.org\\",\\"data\\":{\\"destination\\":\\"Greece\\"}}"}',
										name: "write_file",
										output: '{"path":"travel-request.json"}',
									},
								}),
							);
							sseStream.emit(
								eventFactory.create("tool.completed", {
									toolCall: {
										id: "tc-4",
										input:
											'{"command":["meridian","proposal-requests","create","--product","travel","--version","1.0","--file","travel-request.json","--json"],"timeoutMs":120000}',
										name: "run_command",
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"pr-travel-1\\"}\\n"}',
									},
								}),
							);
							sseStream.emit(
								eventFactory.create("tool.completed", {
									toolCall: {
										id: "tc-5",
										input:
											'{"command":["meridian","proposals","create","--proposal-request","pr-travel-1","--json"],"timeoutMs":120000}',
										name: "run_command",
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"prop-travel-1\\",\\"status\\":\\"completed\\"}\\n"}',
									},
								}),
							);
							sseStream.emit(
								eventFactory.create("tool.completed", {
									toolCall: {
										id: "tc-6",
										input:
											'{"command":["meridian","results","get","--proposal","prop-travel-1","--json"],"timeoutMs":120000}',
										name: "run_command",
										output:
											'{"exitCode":0,"stderr":"","stdout":"{\\"offerings\\":[{\\"providerName\\":\\"Aviva\\",\\"brandName\\":\\"Single Trip Standard\\"}]}\\n"}',
									},
								}),
							);
							sseStream.emit(
								eventFactory.create("turn.completed", {
									content:
										"I found 2 travel insurance options for Greece:\n\n1. **Aviva** — Single Trip Standard\n   - Price: £12.50\n   - Excess: £100\n\n2. **Admiral** — Annual Gold\n   - Price: £18.75\n   - Excess: £75\n\n**Cheapest**: Aviva at £12.50",
									toolCalls: [
										{
											id: "tc-3",
											name: "write_file",
											input: '{"path":"travel-request.json","contents":"{}"}',
											output: '{"path":"travel-request.json"}',
											state: "completed",
										},
										{
											id: "tc-4",
											name: "run_command",
											input:
												'{"command":["meridian","proposal-requests","create","--product","travel","--version","1.0","--file","travel-request.json","--json"]}',
											output:
												'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"pr-travel-1\\"}\\n"}',
											state: "completed",
										},
										{
											id: "tc-5",
											name: "run_command",
											input:
												'{"command":["meridian","proposals","create","--proposal-request","pr-travel-1","--json"]}',
											output:
												'{"exitCode":0,"stderr":"","stdout":"{\\"id\\":\\"prop-travel-1\\"}\\n"}',
											state: "completed",
										},
										{
											id: "tc-6",
											name: "run_command",
											input:
												'{"command":["meridian","results","get","--proposal","prop-travel-1","--json"]}',
											output:
												'{"exitCode":0,"stderr":"","stdout":"{\\"offerings\\":[]}\\n"}',
											state: "completed",
										},
									],
								}),
							);
						});
						return createChatAcceptedResponse("turn-123");
					},
				),
			),
		);

		// Turn 1: user asks about travel insurance
		await chatPage.sendMessage("Help me compare travel insurance");
		await chatPage.expectUserMessage("Help me compare travel insurance");
		await chatPage.expectAssistantResponse("Destination");
		await chatPage.expectToolActivityVisible(
			"Loaded instructions, ran a command",
		);

		// Turn 2: user provides trip details
		await chatPage.sendMessage(
			"Email: tester@email.org, Greece, 1st April 2026, 7 nights, 2 adults",
		);
		await chatPage.expectAssistantResponse("Aviva");
		await chatPage.expectAssistantResponse("Cheapest");
		await chatPage.expectToolActivityVisible("Wrote a file, ran 3 commands");
	});
});
