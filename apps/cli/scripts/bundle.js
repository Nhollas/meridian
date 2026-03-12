import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const outfile = join(import.meta.dirname, "..", "dist", "meridian.js");
const banner = `#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);`;

const cliRoot = join(import.meta.dirname, "..");
const srcDir = resolve(cliRoot, "src");

/** @type {import("esbuild").Plugin} */
const tsconfigPathsPlugin = {
	name: "tsconfig-paths",
	setup(b) {
		b.onResolve({ filter: /^@\// }, (args) => ({
			path: resolve(srcDir, `${args.path.slice(2)}.ts`),
		}));
	},
};

await build({
	entryPoints: [join(srcDir, "entrypoint.ts")],
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	outfile,
	banner: {
		js: banner,
	},
	plugins: [tsconfigPathsPlugin],
	external: [],
});

// Make executable
await chmod(outfile, 0o755);

const { stdout } = await execFileAsync(process.execPath, [
	outfile,
	"--version",
]);
if (stdout.trim() !== packageJson.version) {
	throw new Error(`Bundle smoke test failed for ${outfile}.`);
}

const symlinkDirectory = await mkdtemp(join(tmpdir(), "meridian-bundle-"));
const symlinkPath = join(symlinkDirectory, "meridian");

try {
	await symlink(outfile, symlinkPath);
	const { stdout: symlinkStdout } = await execFileAsync(symlinkPath, [
		"--version",
	]);
	if (symlinkStdout.trim() !== packageJson.version) {
		throw new Error(`Symlink smoke test failed for ${outfile}.`);
	}
} finally {
	await rm(symlinkDirectory, { recursive: true, force: true });
}

console.log(`Bundled to ${outfile}`);
