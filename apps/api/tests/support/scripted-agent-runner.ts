import type {
	AgentRunnerChunk,
	AgentRunnerTools,
	CreateAgentRunner,
	StreamTurnResult,
} from "@/lib/agent/runner";

type ScriptedTurn = (params: {
	message: string;
	sessionId: string;
	tools: AgentRunnerTools;
}) =>
	| AsyncIterable<AgentRunnerChunk>
	| Iterable<AgentRunnerChunk>
	| Promise<AsyncIterable<AgentRunnerChunk> | Iterable<AgentRunnerChunk>>;

type InvokableTool = {
	call?: (input: unknown) => Promise<unknown>;
	func?: (input: unknown) => Promise<unknown>;
	name: string;
};

export function createScriptedAgentRunner(
	script: ScriptedTurn,
	options?: {
		getCompleteResponse?: (sessionId: string) => Promise<string | undefined>;
	},
): CreateAgentRunner {
	return ({ tools }) => ({
		async streamTurn({ message, sessionId }): Promise<StreamTurnResult> {
			const chunks = await script({ message, sessionId, tools });
			return {
				chunks: toAsyncIterable(chunks),
				getCompleteResponse: options?.getCompleteResponse
					? async () =>
							(await options.getCompleteResponse?.(sessionId)) ?? undefined
					: async () => undefined,
			};
		},
	});
}

export async function invokeTool(
	tools: AgentRunnerTools,
	name: string,
	input: unknown,
) {
	const tool = tools.find(
		(candidate): candidate is InvokableTool =>
			typeof candidate === "object" &&
			candidate !== null &&
			"name" in candidate &&
			candidate.name === name,
	);

	if (!tool) {
		throw new Error(`Tool ${name} not found`);
	}

	if (typeof tool.call === "function") {
		return tool.call(input);
	}

	if (typeof tool.func === "function") {
		return tool.func(input);
	}

	throw new Error(`Tool ${name} is not invokable`);
}

export function assistantText(text: string): AgentRunnerChunk {
	return {
		content: text,
		messageType: "ai",
		mode: "messages",
	};
}

export function toolStarted(params: {
	id: string;
	input: unknown;
	name: string;
}): AgentRunnerChunk {
	return {
		event: "start",
		input: params.input,
		mode: "tools",
		name: params.name,
		toolCallId: params.id,
	};
}

export function toolCompleted(params: {
	id: string;
	name: string;
	output: unknown;
}): AgentRunnerChunk {
	return {
		event: "end",
		mode: "tools",
		name: params.name,
		output: params.output,
		toolCallId: params.id,
	};
}

export function toolFailed(params: {
	error: unknown;
	id: string;
	name: string;
}): AgentRunnerChunk {
	return {
		error: params.error,
		event: "error",
		mode: "tools",
		name: params.name,
		toolCallId: params.id,
	};
}

function toAsyncIterable(
	chunks: AsyncIterable<AgentRunnerChunk> | Iterable<AgentRunnerChunk>,
): AsyncIterable<AgentRunnerChunk> {
	if (Symbol.asyncIterator in chunks) {
		return chunks;
	}

	return (async function* () {
		yield* chunks;
	})();
}
