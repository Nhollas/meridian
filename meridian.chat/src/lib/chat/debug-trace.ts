import type { RuntimeEventEnvelope } from "@/lib/runtime-events/contracts";
import type { ToolCallViewModel } from "./contracts";
import type { ChatMessageViewModel } from "./view-models";

export type ChatTurnTrace = {
	at: string;
	/** ID of the user message that triggered this turn. */
	userMessageId: string;
	sessionId: string;
	runtimeEvents: RuntimeEventEnvelope[];
	response?:
		| {
				content: string;
				toolCalls: ToolCallViewModel[];
		  }
		| {
				error: string;
		  };
};

export function createTurnTrace({
	recordedAt = new Date().toISOString(),
	response,
	runtimeEvents,
	sessionId,
	userMessageId,
}: {
	recordedAt?: string;
	response: NonNullable<ChatTurnTrace["response"]>;
	runtimeEvents: RuntimeEventEnvelope[];
	sessionId: string;
	userMessageId: string;
}): ChatTurnTrace {
	return {
		at: recordedAt,
		response,
		runtimeEvents: [...runtimeEvents],
		sessionId,
		userMessageId,
	};
}

export function buildDebugTrace({
	messages,
	sessionId,
	turnLogs,
}: {
	messages: ChatMessageViewModel[];
	sessionId: string | null;
	turnLogs: ChatTurnTrace[];
}) {
	return {
		exportedAt: new Date().toISOString(),
		sessionId,
		messages,
		turnLogs,
	};
}
