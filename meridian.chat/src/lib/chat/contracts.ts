export type ToolCallViewStatus = "running" | "completed" | "error";

export interface ToolCallViewModel {
	id: string;
	input?: string;
	name: string;
	result: string;
	status?: ToolCallViewStatus;
}

export interface ChatRequest {
	message: string;
	sessionId?: string;
}
