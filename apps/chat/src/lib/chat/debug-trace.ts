import type { RuntimeEventEnvelope } from "@meridian/contracts/runtime-events";
import type { ToolCallViewModel } from "./contracts";
import type { ChatMessageViewModel } from "./view-models";

type DebugTraceExportArgs = {
	messages: ChatMessageViewModel[];
	sessionId: string | null;
};

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
}: DebugTraceExportArgs & {
	turnLogs: ChatTurnTrace[];
}) {
	return {
		exportedAt: new Date().toISOString(),
		sessionId,
		messages,
		turnLogs,
	};
}

export function buildCopyDebugTrace({
	messages,
	sessionId,
}: DebugTraceExportArgs) {
	return {
		exportedAt: new Date().toISOString(),
		sessionId,
		messages,
	};
}
