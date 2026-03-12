import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
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
				plugins: [react()],
				test: {
					name: "browser",
					include: ["tests/ui/**/*.test.tsx"],
					setupFiles: ["tests/setup/browser.ts"],
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});
