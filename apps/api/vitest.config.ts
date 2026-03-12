import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		clearMocks: true,
		restoreMocks: true,
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					environment: "node",
					exclude: ["src/**/*.integration.test.ts"],
					include: ["src/**/*.test.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "integration",
					environment: "node",
					include: ["src/**/*.integration.test.ts"],
				},
			},
		],
	},
});
