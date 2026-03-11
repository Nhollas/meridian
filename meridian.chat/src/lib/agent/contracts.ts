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
