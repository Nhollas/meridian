import { HumanMessage } from "@langchain/core/messages";
import { Command, MemorySaver } from "@langchain/langgraph";
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
		sessionId: string;
	}): Promise<AsyncIterable<AgentRunnerChunk>>;
	resumeTurn(params: {
		sessionId: string;
		resumeValue: unknown;
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

	function mapStreamToChunks(
		stream: AsyncIterable<[string, unknown]>,
	): AsyncIterable<AgentRunnerChunk> {
		return (async function* () {
			for await (const [mode, chunk] of stream) {
				if (mode === "messages") {
					const [messageChunk] = chunk as [{ content: unknown; type: string }];
					yield {
						content: messageChunk.content,
						messageType: messageChunk.type,
						mode: "messages",
					} satisfies AgentRunnerChunk;
					continue;
				}

				const toolChunk = chunk as {
					error?: unknown;
					event: string;
					input?: unknown;
					name: string;
					output?: unknown;
					toolCallId?: string;
				};

				if (toolChunk.event === "on_tool_start") {
					yield {
						event: "start",
						input: toolChunk.input,
						mode: "tools",
						name: toolChunk.name,
						...(toolChunk.toolCallId
							? { toolCallId: toolChunk.toolCallId }
							: {}),
					} satisfies AgentRunnerChunk;
					continue;
				}

				if (toolChunk.event === "on_tool_end") {
					yield {
						event: "end",
						mode: "tools",
						name: toolChunk.name,
						output: toolChunk.output,
						...(toolChunk.toolCallId
							? { toolCallId: toolChunk.toolCallId }
							: {}),
					} satisfies AgentRunnerChunk;
					continue;
				}

				if (toolChunk.event === "on_tool_error") {
					yield {
						error: toolChunk.error,
						event: "error",
						mode: "tools",
						name: toolChunk.name,
						...(toolChunk.toolCallId
							? { toolCallId: toolChunk.toolCallId }
							: {}),
					} satisfies AgentRunnerChunk;
				}
			}
		})();
	}

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

			return mapStreamToChunks(stream as AsyncIterable<[string, unknown]>);
		},

		async resumeTurn({ sessionId, resumeValue }) {
			const stream = await agent.stream(new Command({ resume: resumeValue }), {
				configurable: { thread_id: sessionId },
				recursionLimit: MAX_ITERATIONS,
				streamMode: ["messages", "tools"],
			});

			return mapStreamToChunks(stream as AsyncIterable<[string, unknown]>);
		},
	};
};
