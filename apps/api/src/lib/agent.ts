import { HumanMessage } from "@langchain/core/messages";
import { GraphRecursionError, MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import {
	type BackgroundCommandCompleteCallback,
	type BackgroundTaskStartedCallback,
	createRuntimeAgentTools,
	extractTextContent,
	stringifyMessageContent,
} from "@/lib/agent-tools";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { systemPrompt } from "./system-prompt";

// -- Agent contracts --

export type AgentToolCallState = "running" | "completed" | "failed";

export interface AgentToolCall {
	id: string;
	input?: string;
	name: string;
	output: string;
	state?: AgentToolCallState;
}

export interface AgentTurnResult {
	content: string;
	toolCalls: AgentToolCall[];
}

export type AgentProgressEvent =
	| {
			type: "text-delta";
			text: string;
	  }
	| {
			type: "tool-call";
			toolCall: AgentToolCall;
	  };

// -- Runner contracts --

export type AgentRunnerTools = NonNullable<
	Parameters<typeof createAgent>[0]["tools"]
>;

export type AgentRunnerChunk =
	| {
			content: unknown;
			messageType: string;
			mode: "messages";
	  }
	| {
			event: "start";
			input: unknown;
			mode: "tools";
			name: string;
			toolCallId?: string;
	  }
	| {
			event: "end";
			mode: "tools";
			name: string;
			output: unknown;
			toolCallId?: string;
	  }
	| {
			error: unknown;
			event: "error";
			mode: "tools";
			name: string;
			toolCallId?: string;
	  };

export interface AgentRunner {
	streamTurn(params: {
		message: string;
		sessionId: string;
	}): Promise<AsyncIterable<AgentRunnerChunk>>;
}

export type CreateAgentRunner = (params: {
	tools: AgentRunnerTools;
}) => AgentRunner;

// -- LangChain runner implementation --

const MAX_ITERATIONS = 20;

const checkpointer = new MemorySaver();
const model = new ChatOpenAI({ model: "gpt-5.4" });

export const createLangChainAgentRunner: CreateAgentRunner = ({ tools }) => {
	const agent = createAgent({
		checkpointer,
		model,
		systemPrompt,
		tools,
	});

	return {
		async streamTurn({ message, sessionId }) {
			const stream = await agent.stream(
				{ messages: [new HumanMessage(message)] },
				{
					configurable: { thread_id: sessionId },
					recursionLimit: MAX_ITERATIONS,
					streamMode: ["messages", "tools"],
				},
			);

			return (async function* () {
				for await (const [mode, chunk] of stream) {
					if (mode === "messages") {
						const [messageChunk] = chunk;
						yield {
							content: messageChunk.content,
							messageType: messageChunk.type,
							mode: "messages",
						} satisfies AgentRunnerChunk;
						continue;
					}

					if (chunk.event === "on_tool_start") {
						yield {
							event: "start",
							input: chunk.input,
							mode: "tools",
							name: chunk.name,
							...(chunk.toolCallId ? { toolCallId: chunk.toolCallId } : {}),
						} satisfies AgentRunnerChunk;
						continue;
					}

					if (chunk.event === "on_tool_end") {
						yield {
							event: "end",
							mode: "tools",
							name: chunk.name,
							output: chunk.output,
							...(chunk.toolCallId ? { toolCallId: chunk.toolCallId } : {}),
						} satisfies AgentRunnerChunk;
						continue;
					}

					if (chunk.event === "on_tool_error") {
						yield {
							error: chunk.error,
							event: "error",
							mode: "tools",
							name: chunk.name,
							...(chunk.toolCallId ? { toolCallId: chunk.toolCallId } : {}),
						} satisfies AgentRunnerChunk;
					}
				}
			})();
		},
	};
};

// -- Agent service --

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
}

export type AgentServiceDependencies = {
	createRunner?: CreateAgentRunner;
	onBackgroundCommandComplete?: BackgroundCommandCompleteCallback | undefined;
	onBackgroundTaskStarted?: BackgroundTaskStartedCallback | undefined;
	runtime: SandboxRuntime;
};

export type CreateAgentService = (
	dependencies: AgentServiceDependencies,
) => AgentService;

export const createAgentService: CreateAgentService = ({
	createRunner = createLangChainAgentRunner,
	onBackgroundCommandComplete,
	onBackgroundTaskStarted,
	runtime,
}) => {
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
			const tools = createRuntimeAgentTools({
				onBackgroundCommandComplete,
				onBackgroundTaskStarted,
				runtime,
				sessionId,
			});
			const runner = createRunner({ tools });
			const observedToolCalls = new Map<string, AgentToolCall>();
			let currentGeneration = "";

			try {
				const stream = await runner.streamTurn({ message, sessionId });

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

				if (isClosedControllerError(error) && currentGeneration) {
					return {
						content: currentGeneration,
						toolCalls: [...observedToolCalls.values()],
					};
				}

				throw error;
			}
		},
	};
};

function isClosedControllerError(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		error.message.includes("Controller is already closed")
	);
}
