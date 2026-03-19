import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Finding } from "./types.ts";

const exec = promisify(execFile);

/** Run a gh CLI command and return stdout. */
async function gh(...args: string[]): Promise<string> {
	const { stdout } = await exec("gh", args);
	return stdout.trim();
}

/** Get the diff for a PR against its base branch. */
export async function getPrDiff(
	repo: string,
	prNumber: number,
): Promise<string> {
	return gh("pr", "diff", String(prNumber), "--repo", repo);
}

/** Check if a PR is still open. */
export async function isPrOpen(
	repo: string,
	prNumber: number,
): Promise<boolean> {
	const state = await gh(
		"pr",
		"view",
		String(prNumber),
		"--repo",
		repo,
		"--json",
		"state",
		"--jq",
		".state",
	);
	return state === "OPEN";
}

/** Get the clone URL for a repo. */
export async function getCloneUrl(repo: string): Promise<string> {
	const url = await gh(
		"repo",
		"view",
		repo,
		"--json",
		"sshUrl",
		"--jq",
		".sshUrl",
	);
	return url;
}

/** Format findings into the checkbox markdown comment. */
export function formatComment(reviewId: string, findings: Finding[]): string {
	if (findings.length === 0) {
		return [
			"## Conventions Check",
			"",
			"This PR follows the existing codebase conventions. No issues found.",
			"",
			`<!-- agent:review-id:${reviewId} -->`,
		].join("\n");
	}

	const items = findings.map((f) => {
		const location = `\`${f.violation.path}:${f.violation.startLine}\``;
		const example = `\`${f.conventionExample.path}:${f.conventionExample.startLine}\``;
		return `- [ ] **${f.title}** (${location})\n  ${f.description} See ${example} for an example.`;
	});

	return [
		"## Conventions Check",
		"",
		"I've checked this PR against the existing codebase patterns. The following are inconsistent with established conventions:",
		"",
		...items,
		"",
		"---",
		"*Fix these manually or tick the checkboxes and reply `/go` to apply fixes automatically.*",
		`<!-- agent:review-id:${reviewId} -->`,
	].join("\n");
}

/** Post a comment on a PR. Returns the comment ID. */
export async function postComment(
	repo: string,
	prNumber: number,
	body: string,
): Promise<number> {
	const result = await gh(
		"pr",
		"comment",
		String(prNumber),
		"--repo",
		repo,
		"--body",
		body,
	);
	// gh pr comment prints the URL — extract the comment ID from it
	const match = result.match(/#issuecomment-(\d+)/);
	if (match) return Number(match[1]);

	// Fallback: fetch the latest comment to get its ID
	const comments = await gh(
		"api",
		`repos/${repo}/issues/${prNumber}/comments`,
		"--jq",
		".[-1].id",
	);
	return Number(comments);
}

/** Update an existing comment. */
export async function updateComment(
	repo: string,
	commentId: number,
	body: string,
): Promise<void> {
	await gh(
		"api",
		`repos/${repo}/issues/comments/${commentId}`,
		"--method",
		"PATCH",
		"--field",
		`body=${body}`,
	);
}

/** Post a reply comment on a PR. */
export async function postReply(
	repo: string,
	prNumber: number,
	body: string,
): Promise<void> {
	await gh("pr", "comment", String(prNumber), "--repo", repo, "--body", body);
}

/** Get all comments on a PR to find the agent's review comment. */
export async function findReviewComment(
	repo: string,
	prNumber: number,
): Promise<{ commentId: number; body: string; reviewId: string } | null> {
	const commentsJson = await gh(
		"api",
		`repos/${repo}/issues/${prNumber}/comments`,
		"--jq",
		"[.[] | {id: .id, body: .body}]",
	);
	const comments: { id: number; body: string }[] = JSON.parse(commentsJson);

	for (const comment of comments) {
		const match = comment.body.match(/<!-- agent:review-id:(\w+) -->/);
		if (match) {
			return {
				commentId: comment.id,
				body: comment.body,
				reviewId: match[1],
			};
		}
	}
	return null;
}

/** Parse checked items from the markdown comment body. */
export function parseCheckedItems(body: string): string[] {
	const regex = /- \[x\] \*\*(.+?)\*\*/gi;
	return Array.from(body.matchAll(regex), (m) => m[1]);
}

/** Clone a repo to a target directory and checkout a branch. */
export async function cloneAndCheckout(
	repo: string,
	branch: string,
	targetDir: string,
): Promise<void> {
	const cloneUrl = await getCloneUrl(repo);
	await exec("git", ["clone", "--branch", branch, cloneUrl, targetDir]);
}
