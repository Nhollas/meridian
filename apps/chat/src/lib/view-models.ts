export type { ToolCallViewModel, ToolCallViewStatus } from "./contracts";

import type { ToolCallViewModel } from "./contracts";

export const TOOL_NAMES = {
	get_runtime_instructions: "Runtime Instructions",
	inspect_background_command: "Inspect Background Command",
	list_directory: "List Directory",
	list_background_commands: "List Background Commands",
	read_file: "Read File",
	run_command: "Run Command",
	terminate_background_command: "Terminate Background Command",
	wait_for_background_command: "Wait For Background Command",
	write_file: "Write File",
} as const;

export type ChatMessageStatus = "streaming" | "complete" | "error";

export interface ChatMessageViewModel {
	id: string;
	role: "user" | "assistant";
	content: string;
	toolCalls?: ToolCallViewModel[];
	timestamp: string;
	status?: ChatMessageStatus;
}
