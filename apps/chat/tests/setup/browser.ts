import { afterAll, afterEach, beforeAll } from "vitest";
import { browserWorker } from "../ui/msw";
import "../../src/app/globals.css";

function loadGoogleFonts() {
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href =
		"https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700&family=DM+Mono:wght@400;500&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap";
	document.head.appendChild(link);
}

loadGoogleFonts();

beforeAll(async () => {
	await browserWorker.start({
		onUnhandledRequest: "error",
		quiet: true,
	});
});

afterEach(() => {
	browserWorker.resetHandlers();
	window.sessionStorage.clear();
});

afterAll(() => {
	browserWorker.stop();
});
