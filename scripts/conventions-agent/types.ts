export type Finding = {
	id: string;
	title: string;
	description: string;
	violation: {
		path: string;
		startLine: number;
		endLine: number;
	};
	conventionExample: {
		path: string;
		startLine: number;
		endLine: number;
	};
	selected: boolean;
	implemented: boolean;
};

export type ReviewJob = {
	id: string;
	repo: string;
	prNumber: number;
	headBranch: string;
	baseBranch: string;
	commentId: number;
	findings: Finding[];
	status: "implementing" | "done" | "error";
	createdAt: string;
	updatedAt: string;
	error?: string;
};

export type AgentConfig = {
	githubWebhookSecret: string;
	model: string;
	maxFindingsPerCheck: number;
	workDir: string;
	dataDir: string;
	port: number;
};

export const DEFAULT_CONFIG: AgentConfig = {
	githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
	model: "claude-sonnet-4-6",
	maxFindingsPerCheck: 10,
	workDir: process.env.WORK_DIR ?? "/tmp/pr-conventions-work",
	dataDir: process.env.DATA_DIR ?? ".data",
	port: Number(process.env.PORT ?? 3000),
};
