import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { systemPrompt } from "../system-prompt";

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

export interface AgentRunner {
	streamTurn(params: {
		message: string;
		recursionLimit?: number | undefined;
		sessionId: string;
	}): Promise<AsyncIterable<AgentRunnerChunk>>;
}

export type CreateAgentRunner = (params: {
	tools: AgentRunnerTools;
}) => AgentRunner;

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
		async streamTurn({ message, sessionId, recursionLimit }) {
			const stream = await agent.stream(
				{ messages: [new HumanMessage(message)] },
				{
					configurable: { thread_id: sessionId },
					recursionLimit: recursionLimit ?? MAX_ITERATIONS,
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
