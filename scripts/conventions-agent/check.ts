/**
 * Conventions check agent.
 *
 * Reads a PR diff, explores the codebase for established patterns,
 * and returns a structured list of convention violations.
 *
 * Designed to run both in CI (GitHub Actions) and locally for testing.
 *
 * Usage (CI):  node examples/pr-conventions-agent/check.ts
 *   Expects: PR_NUMBER, REPO, BASE_BRANCH env vars
 *
 * Usage (local test): node examples/pr-conventions-agent/check.ts --repo owner/repo --pr 42
 */

import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
	findReviewComment,
	formatComment,
	getPrDiff,
	postComment,
	updateComment,
} from "./github.ts";
import { DEFAULT_CONFIG, type Finding } from "./types.ts";

const FINDINGS_SCHEMA = {
	type: "object" as const,
	properties: {
		findings: {
			type: "array" as const,
			items: {
				type: "object" as const,
				properties: {
					title: {
						type: "string" as const,
						description:
							"Short summary, e.g. 'Use the API client instead of raw fetch'",
					},
					description: {
						type: "string" as const,
						description:
							"Explanation of the violation and what the convention is",
					},
					violation: {
						type: "object" as const,
						properties: {
							path: { type: "string" as const },
							startLine: { type: "number" as const },
							endLine: { type: "number" as const },
						},
						required: ["path", "startLine", "endLine"] as const,
					},
					conventionExample: {
						type: "object" as const,
						properties: {
							path: { type: "string" as const },
							startLine: { type: "number" as const },
							endLine: { type: "number" as const },
						},
						required: ["path", "startLine", "endLine"] as const,
					},
				},
				required: [
					"title",
					"description",
					"violation",
					"conventionExample",
				] as const,
			},
		},
	},
	required: ["findings"] as const,
};

type FindingsOutput = {
	findings: Array<{
		title: string;
		description: string;
		violation: { path: string; startLine: number; endLine: number };
		conventionExample: { path: string; startLine: number; endLine: number };
	}>;
};

function buildPrompt(diff: string, maxFindings: number): string {
	return `You are a codebase conventions checker. Your job is to find places where the PR diff below diverges from established patterns and conventions in the existing codebase.

## Instructions

1. Read the diff carefully to understand what was changed.
2. For each pattern you see in the diff (imports, utilities, naming, file structure, error handling, test patterns), use Glob and Grep to search the codebase for how those same things are done elsewhere.
3. If the PR does something differently from the clear majority pattern in the codebase, flag it.
4. For each finding, reference BOTH where the violation is AND a concrete example of the convention elsewhere.
5. If a convention file (.conventions) exists at the repo root, read it for additional hints.

## Rules

- Only flag clear convention violations where the codebase has a strong majority pattern.
- Do NOT flag things where the codebase is split 50/50.
- Do NOT flag general code quality, performance, or security issues.
- Do NOT flag style/formatting (that's what linters are for).
- Be specific about file paths and line numbers.
- Maximum ${maxFindings} findings.

## PR Diff

\`\`\`diff
${diff}
\`\`\`

Analyse the diff, explore the codebase, and return your findings.`;
}

/** Parse CLI args for local testing. */
function parseArgs(): { repo: string; prNumber: number } {
	const args = process.argv.slice(2);
	let repo = process.env.REPO ?? "";
	let prNumber = Number(process.env.PR_NUMBER ?? 0);

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--repo" && args[i + 1]) repo = args[++i];
		if (args[i] === "--pr" && args[i + 1]) prNumber = Number(args[++i]);
	}

	if (!repo || !prNumber) {
		console.error("Usage: node check.ts --repo owner/repo --pr 42");
		console.error("  Or set REPO and PR_NUMBER env vars.");
		process.exit(1);
	}

	return { repo, prNumber };
}

async function main() {
	const { repo, prNumber } = parseArgs();
	const config = DEFAULT_CONFIG;

	console.log(`Checking conventions for ${repo}#${prNumber}...`);

	// Get the PR diff
	const diff = await getPrDiff(repo, prNumber);
	if (!diff) {
		console.log("Empty diff — nothing to check.");
		process.exit(0);
	}

	// Run the conventions check agent
	const prompt = buildPrompt(diff, config.maxFindingsPerCheck);
	let structuredOutput: unknown;

	for await (const msg of query({
		prompt,
		options: {
			model: config.model,
			allowedTools: ["Read", "Glob", "Grep"],
			permissionMode: "dontAsk",
			outputFormat: { type: "json_schema", schema: FINDINGS_SCHEMA },
		},
	})) {
		if (msg.type === "result" && msg.subtype === "success") {
			structuredOutput = msg.structured_output;
			console.log(
				`Check complete (${msg.num_turns} turns, $${msg.total_cost_usd.toFixed(4)})`,
			);
		}
	}

	if (!structuredOutput) {
		console.error("Agent did not return structured output.");
		process.exit(1);
	}

	const output = structuredOutput as FindingsOutput;
	const findings: Finding[] = output.findings.map((f) => ({
		id: randomUUID().slice(0, 8),
		...f,
		selected: false,
		implemented: false,
	}));

	console.log(`Found ${findings.length} convention violation(s).`);

	// Post or update the PR comment
	const reviewId = randomUUID().slice(0, 8);
	const commentBody = formatComment(reviewId, findings);

	const existing = await findReviewComment(repo, prNumber);
	if (existing) {
		await updateComment(repo, existing.commentId, commentBody);
		console.log(`Updated existing comment #${existing.commentId}`);
	} else {
		const commentId = await postComment(repo, prNumber, commentBody);
		console.log(`Posted comment #${commentId}`);
	}

	// Exit with failure if there are findings (blocks merge as a required check)
	if (findings.length > 0) {
		console.log("CI check failed — convention violations found.");
		process.exit(1);
	}

	console.log("CI check passed — no convention violations.");
}

main().catch((err) => {
	console.error("Conventions check failed:", err);
	process.exit(1);
});
