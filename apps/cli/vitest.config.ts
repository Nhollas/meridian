import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		silent: "passed-only",
		setupFiles: ["./tests/setup/msw.ts"],
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/dev.ts"],
			reporter: ["text", "lcov"],
		},
	},
});
