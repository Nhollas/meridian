import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { systemPrompt } from "../system-prompt";
import { extractTextContent } from "./tools";

const MAX_ITERATIONS = 20;

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

export type StreamTurnResult = {
	chunks: AsyncIterable<AgentRunnerChunk>;
	getCompleteResponse: () => Promise<string | undefined>;
};

export interface AgentRunner {
	streamTurn(params: {
		message: string;
		recursionLimit?: number | undefined;
		sessionId: string;
	}): Promise<StreamTurnResult>;
}

export type CreateAgentRunner = (params: {
	tools: AgentRunnerTools;
}) => AgentRunner;

const checkpointer = new MemorySaver();

export const createLangChainAgentRunner: CreateAgentRunner = ({ tools }) => {
	const model = new ChatOpenAI({ model: "gpt-5.4" });
	const agent = createAgent({
		checkpointer,
		model,
		systemPrompt,
		tools,
	});

	return {
		async streamTurn({ message, sessionId, recursionLimit }) {
			// Use streamMode "updates" to avoid LangGraph's internal
			// StreamMessagesHandler and StreamToolsHandler, which both suffer
			// from a TransformStream controller race condition
			// (ERR_INVALID_STATE: Controller is already closed) when
			// resuming from a completed checkpoint. The "updates" mode
			// yields state diffs directly from the graph execution loop
			// without callback-based TransformStream controllers.
			const stream = await agent.stream(
				{ messages: [new HumanMessage(message)] },
				{
					configurable: { thread_id: sessionId },
					recursionLimit: recursionLimit ?? MAX_ITERATIONS,
					streamMode: ["updates"],
				},
			);

			return {
				chunks: (async function* () {
					for await (const [, update] of stream) {
						// Each update is { [nodeName]: nodeOutput }.
						// Agent node output contains the AI message (text + tool calls).
						// Tools node output contains tool result messages.
						for (const nodeOutput of Object.values(update)) {
							// biome-ignore lint: LangGraph state updates are untyped
							const msgs = (nodeOutput as any)?.messages;
							if (!Array.isArray(msgs)) continue;

							for (const msg of msgs) {
								// biome-ignore lint: LangChain message types are untyped
								const m = msg as any;
								const type =
									typeof m?._getType === "function" ? m._getType() : m?.type;

								if (type === "ai") {
									// Yield tool-started events for each tool call
									const toolCalls = m.tool_calls ?? [];
									for (const tc of toolCalls) {
										yield {
											event: "start",
											input: tc.args,
											mode: "tools",
											name: tc.name,
											...(tc.id ? { toolCallId: tc.id } : {}),
										} satisfies AgentRunnerChunk;
									}

									// Yield text content (if any)
									const text = extractTextContent(m.content);
									if (text) {
										yield {
											content: m.content,
											messageType: "ai",
											mode: "messages",
										} satisfies AgentRunnerChunk;
									}
								}

								if (type === "tool") {
									yield {
										event: "end",
										mode: "tools",
										name: m.name,
										output: m.content,
										...(m.tool_call_id ? { toolCallId: m.tool_call_id } : {}),
									} satisfies AgentRunnerChunk;
								}
							}
						}
					}
				})(),
				async getCompleteResponse() {
					try {
						const state = (await agent.getState({
							configurable: { thread_id: sessionId },
						})) as { values?: { messages?: unknown[] } };
						const messages = state?.values?.messages;
						if (!Array.isArray(messages)) return undefined;
						for (let i = messages.length - 1; i >= 0; i--) {
							// biome-ignore lint: LangChain message types are untyped here
							const m = messages[i] as any;
							const type =
								typeof m?._getType === "function" ? m._getType() : m?.type;
							if (type === "ai") {
								return extractTextContent(m.content) || undefined;
							}
						}
						return undefined;
					} catch {
						return undefined;
					}
				},
			};
		},
	};
};
