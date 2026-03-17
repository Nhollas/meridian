import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentService } from "@/lib/agent";
import type { SandboxConfig } from "@/lib/sandbox/config";
import { createDockerRuntime } from "@/lib/sandbox/docker-runtime";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";
import { createFakeDockerClient } from "../../tests/support/fake-docker-client";
import {
	assistantText,
	createScriptedAgentRunner,
	invokeTool,
	toolCompleted,
	toolStarted,
} from "../../tests/support/scripted-agent-runner";
import { createTempSessionDir } from "../../tests/support/temp-session-dir";
import { createTurnEngine } from "./turn-engine";

describe("TurnEngine integration", () => {
	it("runs the agent with tools and streams events via the registry", async () => {
		const tmp = await createTempSessionDir();
		const client = createFakeDockerClient();

		const instructionsFile = join(tmp.rootDirectory, "instructions.txt");
		await writeFile(instructionsFile, "You are a helpful assistant.");

		const config: SandboxConfig = {
			dockerBinary: "docker",
			extraCaCertsFile: undefined,
			instructionsFile,
			meridianAuthClientId: "meridian-cli",
			meridianAuthIssuer: "http://host.docker.internal:8080/realms/meridian",
			proxyEnv: {},
			rootDirectory: tmp.rootDirectory,
			runtime: "docker",
			sandboxImage: "meridian-chat-sandbox:local",
			sessionTtlMs: 5 * 60 * 1000,
		};

		const runtime = createDockerRuntime(config, { client });

		const createRunner = createScriptedAgentRunner(async function* ({
			message,
			tools,
		}) {
			expect(message).toBe("OAuth callback: user authenticated on sky.com");

			yield toolStarted({
				id: "tool-1",
				input: {},
				name: "get_runtime_instructions",
			});
			const instructions = await invokeTool(
				tools,
				"get_runtime_instructions",
				{},
			);
			yield toolCompleted({
				id: "tool-1",
				name: "get_runtime_instructions",
				output: instructions,
			});

			yield assistantText(
				"Great, you are now logged in. Let me fetch your broadband deals.",
			);
		});
		const { registry, collectTurnEvents } = createCollectingRegistry();

		const engine = createTurnEngine({
			createAgentService: (deps) =>
				createAgentService({
					createRunner,
					onBackgroundCommandComplete: deps.onBackgroundCommandComplete,
					runtime: deps.runtime,
				}),
			createTurnId: () => "system-turn-1",
			getRuntime: () => runtime,
			registry,
		});

		const eventsPromise = collectTurnEvents("session-abc");

		const turnId = engine.submit({
			sessionId: "session-abc",
			message: "OAuth callback: user authenticated on sky.com",
		});

		expect(turnId).toBe("system-turn-1");

		const events = await eventsPromise;

		expect(events).toEqual([
			expect.objectContaining({
				type: "tool.started",
				turnId: "system-turn-1",
				sessionId: "session-abc",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						name: "get_runtime_instructions",
					}),
				}),
			}),
			expect.objectContaining({
				type: "tool.completed",
				payload: expect.objectContaining({
					toolCall: expect.objectContaining({
						name: "get_runtime_instructions",
						output: "You are a helpful assistant.",
					}),
				}),
			}),
			expect.objectContaining({
				type: "assistant.delta",
				payload: {
					delta:
						"Great, you are now logged in. Let me fetch your broadband deals.",
				},
			}),
			expect.objectContaining({
				type: "turn.completed",
				payload: expect.objectContaining({
					content:
						"Great, you are now logged in. Let me fetch your broadband deals.",
				}),
			}),
		]);
	});
});
