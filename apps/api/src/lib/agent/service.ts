import { GraphInterrupt, GraphRecursionError } from "@langchain/langgraph";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import type {
	AgentProgressEvent,
	AgentToolCall,
	AgentTurnResult,
} from "./contracts";
import type { AgentRunnerChunk } from "./runner";
import { type CreateAgentRunner, createLangChainAgentRunner } from "./runner";
import {
	createRuntimeAgentTools,
	extractTextContent,
	stringifyMessageContent,
} from "./tools";

const FALLBACK_MESSAGE =
	"I ran into an issue processing that request. Could you try again?";
const GRAPH_RECURSION_MESSAGE =
	"The agent stopped because it kept chaining tool calls without reaching a final answer. I returned the tool timeline so you can see what it tried. The next fix is to tighten the prompt or the runtime instructions for this task.";

export interface AgentService {
	streamConversation(params: {
		message: string;
		onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
		sessionId: string;
	}): Promise<AgentTurnResult>;

	resumeConversation(params: {
		sessionId: string;
		resumeValue: unknown;
		onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
	}): Promise<AgentTurnResult>;
}

export type AgentServiceDependencies = {
	createRunner?: CreateAgentRunner;
	runtime: SandboxRuntime;
};

export type CreateAgentService = (
	dependencies: AgentServiceDependencies,
) => AgentService;

export const createAgentService: CreateAgentService = ({
	createRunner = createLangChainAgentRunner,
	runtime,
}) => {
	const tools = createRuntimeAgentTools({ runtime, sessionId: "" });
	let runner = createRunner({ tools });

	function createRunnerForSession(sessionId: string) {
		const sessionTools = createRuntimeAgentTools({ runtime, sessionId });
		runner = createRunner({ tools: sessionTools });
		return runner;
	}

	async function processStream(
		stream: AsyncIterable<AgentRunnerChunk>,
		onEvent: ((event: AgentProgressEvent) => void | Promise<void>) | undefined,
		observedToolCalls: Map<string, AgentToolCall>,
	): Promise<{ content: string }> {
		let currentGeneration = "";

		for await (const chunk of stream) {
			if (chunk.mode === "messages") {
				if (chunk.messageType !== "ai") {
					continue;
				}

				const delta = extractTextContent(chunk.content);
				if (!delta) {
					continue;
				}

				currentGeneration += delta;
				await onEvent?.({ text: delta, type: "text-delta" });
				continue;
			}

			if (chunk.event === "start") {
				const toolCall: AgentToolCall = {
					id: chunk.toolCallId ?? chunk.name,
					input: stringifyMessageContent(chunk.input),
					name: chunk.name,
					output: "",
					state: "running",
				};
				observedToolCalls.set(toolCall.id, toolCall);
				await onEvent?.({ toolCall, type: "tool-call" });
				continue;
			}

			if (chunk.event === "end") {
				const existing = observedToolCalls.get(chunk.toolCallId ?? chunk.name);
				const toolCall: AgentToolCall = {
					id: chunk.toolCallId ?? chunk.name,
					name: chunk.name,
					...(existing?.input ? { input: existing.input } : {}),
					output: stringifyMessageContent(chunk.output),
					state: "completed",
				};
				observedToolCalls.set(toolCall.id, toolCall);
				await onEvent?.({ toolCall, type: "tool-call" });
				continue;
			}

			const existing = observedToolCalls.get(chunk.toolCallId ?? chunk.name);
			const toolCall: AgentToolCall = {
				id: chunk.toolCallId ?? chunk.name,
				name: chunk.name,
				...(existing?.input ? { input: existing.input } : {}),
				output: stringifyMessageContent(chunk.error),
				state: "failed",
			};
			observedToolCalls.set(toolCall.id, toolCall);
			await onEvent?.({ toolCall, type: "tool-call" });
		}

		return { content: currentGeneration };
	}

	return {
		async streamConversation({
			message,
			sessionId,
			onEvent,
		}: {
			message: string;
			sessionId: string;
			onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
		}): Promise<AgentTurnResult> {
			const activeRunner = createRunnerForSession(sessionId);
			const observedToolCalls = new Map<string, AgentToolCall>();

			try {
				const stream = await activeRunner.streamTurn({
					message,
					sessionId,
				});
				const { content } = await processStream(
					stream,
					onEvent,
					observedToolCalls,
				);

				return {
					content: content || FALLBACK_MESSAGE,
					toolCalls: [...observedToolCalls.values()],
				};
			} catch (error) {
				if (error instanceof GraphInterrupt) {
					const interruptValue = error.interrupts?.[0]?.value as
						| { commandId?: string }
						| undefined;
					const commandId = interruptValue?.commandId ?? "";

					return {
						content: "",
						interrupted: { commandId },
						toolCalls: [...observedToolCalls.values()],
					};
				}

				if (error instanceof GraphRecursionError) {
					return {
						content: GRAPH_RECURSION_MESSAGE,
						toolCalls: [...observedToolCalls.values()],
					};
				}

				throw error;
			}
		},

		async resumeConversation({
			sessionId,
			resumeValue,
			onEvent,
		}: {
			sessionId: string;
			resumeValue: unknown;
			onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
		}): Promise<AgentTurnResult> {
			const observedToolCalls = new Map<string, AgentToolCall>();

			try {
				const stream = await runner.resumeTurn({
					sessionId,
					resumeValue,
				});
				const { content } = await processStream(
					stream,
					onEvent,
					observedToolCalls,
				);

				return {
					content: content || FALLBACK_MESSAGE,
					toolCalls: [...observedToolCalls.values()],
				};
			} catch (error) {
				if (error instanceof GraphRecursionError) {
					return {
						content: GRAPH_RECURSION_MESSAGE,
						toolCalls: [...observedToolCalls.values()],
					};
				}

				throw error;
			}
		},
	};
};
