import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CreateAgentRunner } from "@/lib/agent";
import { createAgentService } from "@/lib/agent";
import type { SandboxConfig } from "@/lib/sandbox/config";
import { createDockerRuntime } from "@/lib/sandbox/docker-runtime";
import { createTurnEngine } from "@/lib/turn-engine";
import { createChatRoute } from "@/routes/chat";
import { createCollectingRegistry } from "../../tests/support/collecting-registry";
import {
	createFakeDockerClient,
	type FakeDockerClient,
} from "../../tests/support/fake-docker-client";
import { createTempSessionDir } from "../../tests/support/temp-session-dir";

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

	const config: SandboxConfig = {
		dockerBinary: "docker",
		extraCaCertsFile: undefined,
		instructionsFile,
		meridianAuthClientId: "meridian-cli",
		meridianAuthIssuer: "http://host.docker.internal:8080/realms/meridian",
		proxyEnv: {},
		rootDirectory: tmp.rootDirectory,
		runtime: "docker",
		sandboxImage: "meridian-chat-sandbox:local",
		sessionTtlMs: 5 * 60 * 1000,
	};

	const runtime = createDockerRuntime(config, { client });

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

	return { POST, client, collectTurnEvents, registry, tmp };
}

export type { FakeDockerClient };
