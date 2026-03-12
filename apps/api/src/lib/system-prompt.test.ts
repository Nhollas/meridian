import { describe, expect, it } from "vitest";
import { systemPrompt } from "@/lib/system-prompt";

describe("system prompt contract", () => {
	it("tells the agent to fetch runtime instructions only once at the start of a session", () => {
		expect(systemPrompt).toContain(
			"At the start of a new session, call `get_runtime_instructions` once before exploring capabilities.",
		);
		expect(systemPrompt).toContain(
			"Do not call it again on later turns unless the user asks to refresh it or the earlier attempt failed.",
		);
	});

	it("tells the agent to prefer small read-only exploration and to check help when unsure", () => {
		expect(systemPrompt).toContain(
			"Prefer the smallest read-only step that moves the task forward.",
		);
		expect(systemPrompt).toContain(
			"When unsure how a command works, inspect its help before taking action.",
		);
	});

	it("tells the agent to ask for required missing information instead of inventing it", () => {
		expect(systemPrompt).toContain(
			"Ask the user for required information instead of inventing missing details.",
		);
	});

	it("tells the agent not to claim background work is running without a live command id", () => {
		expect(systemPrompt).toContain(
			"Do not claim a task is still running unless you actually have a live `backgroundCommandId`.",
		);
	});
});
