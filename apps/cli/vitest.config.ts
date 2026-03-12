import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		silent: "passed-only",
		setupFiles: ["./tests/setup/msw.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/dev.ts"],
			reporter: ["text", "lcov"],
		},
	},
});
