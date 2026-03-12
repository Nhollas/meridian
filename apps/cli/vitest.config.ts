import { defineConfig } from "vitest/config";

const meridianLogs = process.env["MERIDIAN_LOGS"];

export default defineConfig({
	test: {
		silent: meridianLogs === "1" ? false : "passed-only",
		setupFiles: ["./tests/setup/msw.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/dev.ts"],
			reporter: ["text", "lcov"],
		},
	},
});
