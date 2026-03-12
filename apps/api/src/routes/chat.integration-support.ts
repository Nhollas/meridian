import type { CreateAgentRunner } from "@/lib/agent/runner";
import { createAgentService } from "@/lib/agent/service";
import type { SandboxRuntime } from "@/lib/sandbox/runtime";
import { createChatRoute } from "@/routes/chat";

export function createTestPost({
	createRunner,
	runtime,
	sleep,
}: {
	createRunner: CreateAgentRunner;
	runtime: SandboxRuntime;
	sleep?: (milliseconds: number) => Promise<void>;
}) {
	let turnCount = 0;

	return createChatRoute({
		createAgentService: ({ runtime }) =>
			createAgentService({ createRunner, runtime }),
		createTurnId: () => `turn-${++turnCount}`,
		getRuntime: () => runtime,
		sleep: sleep ?? (async () => {}),
	});
}
