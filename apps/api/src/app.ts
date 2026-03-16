import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAgentService } from "./lib/agent/service";
import type { BackgroundCommandCompleteCallback } from "./lib/agent/tools";
import { getSandboxRuntime } from "./lib/sandbox/singleton";
import { createSessionStreamRegistry } from "./lib/session-stream-registry";
import { triggerSystemTurn } from "./lib/turn-executor";
import { createChatRoute } from "./routes/chat";
import { createSessionEventsRoute } from "./routes/session-events";

export const app = new Hono();

app.use("*", cors());

const registry = createSessionStreamRegistry();

const onBackgroundCommandComplete: BackgroundCommandCompleteCallback = ({
	commandId,
	command,
	result,
	sessionId,
}) => {
	const message = [
		`[System] Background command ${commandId} (${command.join(" ")}) ${result.status}.`,
		result.stdout ? `Output:\n${result.stdout}` : "",
		result.stderr ? `Errors:\n${result.stderr}` : "",
		"Briefly acknowledge what changed and continue with the next step. Do not repeat information from previous turns.",
	]
		.filter(Boolean)
		.join("\n");

	notifySession({ sessionId, message });
};

const handleChat = createChatRoute({
	onBackgroundCommandComplete,
	registry,
});
const handleSessionEvents = createSessionEventsRoute({ registry });

app.post("/api/chat", (c) => handleChat(c.req.raw));
app.get("/api/sessions/:id/events", handleSessionEvents);

export function notifySession({
	sessionId,
	message,
}: {
	sessionId: string;
	message: string;
}): string {
	const runtime = getSandboxRuntime();
	const agentService = createAgentService({
		onBackgroundCommandComplete,
		runtime,
	});

	return triggerSystemTurn({ agentService, message, registry, sessionId });
}
