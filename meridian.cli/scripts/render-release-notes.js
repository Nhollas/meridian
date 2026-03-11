import { readFileSync } from "node:fs";

const changelogPath = process.argv[2] ?? "CHANGELOG.md";
const changelog = readFileSync(changelogPath, "utf8").replaceAll("\r\n", "\n");
const lines = changelog.split("\n");
const headingPattern = /^(#{1,6})\s+(.+?)\s*$/;

let startIndex = -1;
let endIndex = lines.length;
let releaseHeadingLevel = 0;

for (const [index, line] of lines.entries()) {
	const match = line.match(headingPattern);

	if (!match) {
		continue;
	}

	const [, hashes, title] = match;

	if (title.trim().toLowerCase() === "changelog") {
		continue;
	}

	startIndex = index;
	releaseHeadingLevel = hashes.length;
	break;
}

if (startIndex === -1) {
	throw new Error(`No release notes heading found in ${changelogPath}.`);
}

for (let index = startIndex + 1; index < lines.length; index += 1) {
	const match = lines[index].match(headingPattern);

	if (!match) {
		continue;
	}

	const [, hashes, title] = match;

	if (title.trim().toLowerCase() === "changelog") {
		continue;
	}

	if (hashes.length <= releaseHeadingLevel) {
		endIndex = index;
		break;
	}
}

const releaseNotes = lines.slice(startIndex, endIndex).join("\n").trim();
const projectUrl = process.env.CI_PROJECT_URL;
const packageLink = projectUrl ? `${projectUrl}/-/packages` : null;

const footer = [
	"## Install",
	"",
	"```bash",
	"npm install -g @comparethemarket/meridian-cli",
	"```",
	packageLink ? "" : null,
	packageLink ? `Package registry: ${packageLink}` : null,
]
	.filter((line) => line !== null)
	.join("\n");

process.stdout.write(`${releaseNotes}\n\n${footer}\n`);
