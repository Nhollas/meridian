import { afterEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
	execFile: vi.fn(),
	spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: childProcessMocks.execFile,
	spawn: childProcessMocks.spawn,
}));

import {
	getCheckedPath,
	MAX_OUTPUT_BYTES,
	runToCompletion,
} from "@/lib/sandbox/runtime-shared";

describe("runtime shared helpers", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("rejects file paths that escape the session directory", () => {
		expect(() => getCheckedPath("/tmp/session-123", "../outside.txt")).toThrow(
			"Session file path escapes the sandbox session directory.",
		);
	});

	it("bounds large exec output before returning command results", async () => {
		childProcessMocks.execFile.mockImplementation(
			(
				_file: string,
				_args: string[],
				_options: { timeout: number },
				callback: (
					error: Error | NodeJS.ErrnoException | null,
					stdout: string,
					stderr: string,
				) => void,
			) => {
				callback(
					null,
					"a".repeat(MAX_OUTPUT_BYTES + 64),
					"b".repeat(MAX_OUTPUT_BYTES + 64),
				);
			},
		);

		const result = await runToCompletion(
			{ args: ["echo", "hello"], executable: "docker" },
			{},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(
			`[output truncated at ${MAX_OUTPUT_BYTES} bytes]`,
		);
		expect(result.stderr).toContain(
			`[output truncated at ${MAX_OUTPUT_BYTES} bytes]`,
		);
		expect(result.stdout.startsWith("a".repeat(32))).toBe(true);
		expect(result.stderr.startsWith("b".repeat(32))).toBe(true);
	});
});
