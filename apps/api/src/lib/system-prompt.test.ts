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

	it("tells the agent to treat routine prerequisites like auth startup as part of fulfilling the request", () => {
		expect(systemPrompt).toContain(
			"Treat routine prerequisites such as starting authentication as part of fulfilling the request, including on follow-up turns where the user is only providing missing details.",
		);
	});

	it("tells the agent to re-check changing prerequisites and keep requests user-friendly", () => {
		expect(systemPrompt).toContain(
			"On follow-up turns, if a prerequisite may have changed state in the background, re-check it before asking the user to repeat or confirm it.",
		);
		expect(systemPrompt).toContain(
			"Use plain language for user-facing requests. Translate schema field names into natural wording instead of echoing raw property names.",
		);
		expect(systemPrompt).toContain(
			"Do not ask the user to reply in JSON unless they asked for that format or the task truly requires pasted JSON.",
		);
		expect(systemPrompt).toContain(
			"If the user has already provided all required fields, proceed with sensible defaults for optional fields instead of asking them to confirm that they have no preferences.",
		);
	});

	it("tells the agent not to claim background work is running without a live command id", () => {
		expect(systemPrompt).toContain(
			"Do not claim a task is still running unless you actually have a live `backgroundCommandId`.",
		);
	});

	it("tells the agent to lead with the user-facing outcome and keep replies cohesive", () => {
		expect(systemPrompt).toContain(
			"Lead with the result, decision, or required next action.",
		);
		expect(systemPrompt).toContain(
			"Mention tool use or exploration only when it materially changes what the user needs to know.",
		);
		expect(systemPrompt).toContain(
			"Your final reply for each turn should read as one cohesive response, not a chronological log of tool calls or repeated restatements.",
		);
	});
});
