import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

await build({
	entryPoints: [join(import.meta.dirname, "..", "src", "entrypoint.ts")],
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	outfile,
	banner: {
		js: banner,
	},
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
