import { afterAll, afterEach, beforeAll } from "vitest";
import { browserWorker } from "../ui/msw";
import "../../src/app/globals.css";

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
