import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CreateAgentRunner } from "@/lib/agent";
import { createAgentService } from "@/lib/agent";
import { createDockerRuntime } from "@/lib/sandbox/docker-runtime";
import { createTurnEngine } from "@/lib/turn-engine";
import { createChatRoute } from "@/routes/chat";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";
import {
	createFakeDockerClient,
	type FakeDockerClient,
} from "../../tests/support/fake-docker-client";
import { createTempSessionDir } from "../../tests/support/temp-session-dir";
import { createTestConfig } from "../../tests/support/test-config";

type ClientOptions = NonNullable<Parameters<typeof createFakeDockerClient>[0]>;
type ExecFixture = NonNullable<ClientOptions["execFixtures"]>[number];
type BackgroundExecFixture = NonNullable<
	ClientOptions["backgroundExecFixtures"]
>[number];

export async function createTestChat({
	createRunner,
	execFixtures = [],
	backgroundExecFixtures = [],
	instructions = "",
}: {
	createRunner: CreateAgentRunner;
	execFixtures?: ExecFixture[];
	backgroundExecFixtures?: BackgroundExecFixture[];
	instructions?: string;
}) {
	const tmp = await createTempSessionDir();
	const client = createFakeDockerClient({
		execFixtures,
		backgroundExecFixtures,
	});

	const instructionsFile = join(tmp.rootDirectory, "instructions.txt");
	await writeFile(instructionsFile, instructions);

	const runtime = createDockerRuntime(
		createTestConfig({
			instructionsFile,
			rootDirectory: tmp.rootDirectory,
		}),
		{ client },
	);

	let turnCount = 0;
	const nextTurnId = () => `turn-${++turnCount}`;
	const { registry, collectTurnEvents } = createCollectingRegistry();

	const engine = createTurnEngine({
		createAgentService: (deps) =>
			createAgentService({
				createRunner,
				onBackgroundCommandComplete: deps.onBackgroundCommandComplete,
				runtime: deps.runtime,
			}),
		createTurnId: nextTurnId,
		getRuntime: () => runtime,
		registry,
	});

	const POST = createChatRoute({
		createTurnId: nextTurnId,
		engine,
	});

	return {
		POST,
		client,
		collectTurnEvents,
		registry,
		tmp,
		async [Symbol.asyncDispose]() {
			await tmp[Symbol.asyncDispose]();
		},
	};
}

export type { FakeDockerClient };
