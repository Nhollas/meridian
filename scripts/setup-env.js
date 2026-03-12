import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const apps = ["apps/api", "apps/chat", "apps/cli"];
const root = new URL("..", import.meta.url).pathname;

let created = 0;
let skipped = 0;

for (const app of apps) {
	const example = join(root, app, ".env.example");
	const target = join(root, app, ".env");

	if (!existsSync(example)) continue;

	if (existsSync(target)) {
		console.log(`  skip  ${app}/.env (already exists)`);
		skipped++;
		continue;
	}

	cpSync(example, target);
	console.log(`  copy  ${app}/.env.example → ${app}/.env`);
	created++;
}

console.log();
if (created > 0) {
	console.log(
		`Created ${created} .env file(s). Review them and fill in any required secrets.`,
	);
} else {
	console.log("All .env files already exist. Nothing to do.");
}
