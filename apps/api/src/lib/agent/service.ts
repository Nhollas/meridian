import { GraphRecursionError } from "@langchain/langgraph";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import type {
	AgentProgressEvent,
	AgentToolCall,
	AgentTurnResult,
} from "./contracts";
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
		recursionLimit?: number | undefined;
		sessionId: string;
	}): Promise<AgentTurnResult>;
}

export type OnBackgroundCommandComplete = (
	sessionId: string,
	result: {
		backgroundCommandId: string;
		command: string[];
		exitCode: number;
		stderr: string;
		stdout: string;
		status: string;
	},
) => void;

export type AgentServiceDependencies = {
	createRunner?: CreateAgentRunner;
	onBackgroundCommandComplete?: OnBackgroundCommandComplete | undefined;
	runtime: SandboxRuntime;
};

export type CreateAgentService = (
	dependencies: AgentServiceDependencies,
) => AgentService;

export const createAgentService: CreateAgentService = ({
	createRunner = createLangChainAgentRunner,
	onBackgroundCommandComplete,
	runtime,
}) => {
	return {
		async streamConversation({
			message,
			sessionId,
			onEvent,
			recursionLimit,
		}: {
			message: string;
			sessionId: string;
			onEvent?: (event: AgentProgressEvent) => void | Promise<void>;
			recursionLimit?: number | undefined;
		}): Promise<AgentTurnResult> {
			const tools = createRuntimeAgentTools({
				onBackgroundCommandComplete,
				runtime,
				sessionId,
			});
			const runner = createRunner({ tools });
			const observedToolCalls = new Map<string, AgentToolCall>();
			let currentGeneration = "";

			try {
				const { chunks, getCompleteResponse } = await runner.streamTurn({
					message,
					sessionId,
					recursionLimit,
				});

				for await (const chunk of chunks) {
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
						const existing = observedToolCalls.get(
							chunk.toolCallId ?? chunk.name,
						);
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

					const existing = observedToolCalls.get(
						chunk.toolCallId ?? chunk.name,
					);
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

				if (!currentGeneration.trim()) {
					console.log(
						"[streaming-recovery] No streamed tokens, calling getCompleteResponse for session",
						sessionId,
					);
					const recovered = await getCompleteResponse();
					console.log(
						"[streaming-recovery] getCompleteResponse returned:",
						recovered ? `"${recovered.slice(0, 80)}..."` : "undefined",
					);
					if (recovered) {
						currentGeneration = recovered;
						await onEvent?.({ text: recovered, type: "text-delta" });
					}
				}

				return {
					content: currentGeneration || FALLBACK_MESSAGE,
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
