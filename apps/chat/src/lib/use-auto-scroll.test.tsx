import { useEffect, useRef, useState } from "react";
import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useAutoScroll } from "@/lib/use-auto-scroll";
import type { ChatMessageViewModel } from "@/lib/view-models";

function msg(content: string): ChatMessageViewModel {
	return {
		id: "msg-1",
		role: "assistant",
		content,
		timestamp: new Date().toISOString(),
		status: "streaming",
	};
}

/**
 * Test harness that renders a scrollable container with growing content.
 * Exposes scroll state via data attributes so tests can observe behaviour
 * without needing DOM evaluate calls.
 */
function ScrollHarness() {
	const [content, setContent] = useState("A\n".repeat(50));
	const [scrollState, setScrollState] = useState({
		scrollTop: 0,
		scrollHeight: 0,
		clientHeight: 0,
	});
	const messages = [msg(content)];
	const { scrollRef, handleScroll, enableAutoScroll } = useAutoScroll(messages);
	const observerRef = useRef<ReturnType<typeof setInterval>>(undefined);

	// Poll scroll position so data attributes stay current
	useEffect(() => {
		observerRef.current = setInterval(() => {
			const el = scrollRef.current;
			if (!el) return;
			setScrollState({
				scrollTop: el.scrollTop,
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
			});
		}, 30);
		return () => clearInterval(observerRef.current);
	}, [scrollRef]);

	function simulateUserScrollUp(amount = 150) {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = Math.max(0, el.scrollTop - amount);
	}

	return (
		<div>
			<button
				type="button"
				data-testid="stream-more"
				onClick={() => setContent((c) => `${c}${"more\n".repeat(10)}`)}
			>
				Stream more
			</button>
			<button
				type="button"
				data-testid="scroll-up"
				onClick={() => simulateUserScrollUp(150)}
			>
				Scroll up
			</button>
			<button
				type="button"
				data-testid="scroll-up-small"
				onClick={() => simulateUserScrollUp(30)}
			>
				Scroll up small
			</button>
			<button
				type="button"
				data-testid="send-message"
				onClick={enableAutoScroll}
			>
				Send message
			</button>
			<div
				data-testid="scroll-state"
				data-scroll-top={Math.round(scrollState.scrollTop)}
				data-scroll-height={Math.round(scrollState.scrollHeight)}
				data-at-bottom={
					scrollState.scrollHeight -
						scrollState.scrollTop -
						scrollState.clientHeight <
					10
						? "true"
						: "false"
				}
			/>
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				data-testid="scroll-container"
				style={{ height: "200px", overflow: "auto" }}
			>
				<pre style={{ margin: 0 }}>{content}</pre>
			</div>
		</div>
	);
}

function scrollState() {
	return page.getByTestId("scroll-state");
}

async function waitForUpdate() {
	await new Promise((r) => setTimeout(r, 200));
}

describe("useAutoScroll", () => {
	test("auto-scrolls to bottom when new content arrives", async () => {
		render(<ScrollHarness />);
		await waitForUpdate();

		await page.getByTestId("stream-more").click();
		await waitForUpdate();

		await expect
			.element(scrollState())
			.toHaveAttribute("data-at-bottom", "true");
	});

	test("stops auto-scrolling when user scrolls up", async () => {
		render(<ScrollHarness />);
		await waitForUpdate();

		// User scrolls up
		await page.getByTestId("scroll-up").click();
		await waitForUpdate();

		// Verify we're no longer at the bottom
		await expect
			.element(scrollState())
			.toHaveAttribute("data-at-bottom", "false");

		// Stream more content
		await page.getByTestId("stream-more").click();
		await waitForUpdate();

		// Should NOT have auto-scrolled back to bottom
		await expect
			.element(scrollState())
			.toHaveAttribute("data-at-bottom", "false");
	});

	test("stops auto-scrolling even with a small scroll up", async () => {
		render(<ScrollHarness />);
		await waitForUpdate();

		// Small scroll up (within the 96px near-bottom threshold)
		await page.getByTestId("scroll-up-small").click();
		await waitForUpdate();

		// Stream more content
		await page.getByTestId("stream-more").click();
		await waitForUpdate();

		// Even a small scroll up should stop auto-scroll
		await expect
			.element(scrollState())
			.toHaveAttribute("data-at-bottom", "false");
	});

	test("stays scrolled up through multiple rapid stream updates", async () => {
		render(<ScrollHarness />);
		await waitForUpdate();

		// User scrolls up
		await page.getByTestId("scroll-up").click();
		await waitForUpdate();

		// Simulate rapid streaming — multiple chunks arriving quickly
		for (let i = 0; i < 5; i++) {
			await page.getByTestId("stream-more").click();
			await new Promise((r) => setTimeout(r, 30));
		}
		await waitForUpdate();

		// Should still NOT be at the bottom
		await expect
			.element(scrollState())
			.toHaveAttribute("data-at-bottom", "false");
	});

	test("resumes auto-scrolling when user sends a new message", async () => {
		render(<ScrollHarness />);
		await waitForUpdate();

		// User scrolls up
		await page.getByTestId("scroll-up").click();
		await waitForUpdate();

		// User sends a new message (re-enables auto-scroll)
		await page.getByTestId("send-message").click();

		// Stream more content
		await page.getByTestId("stream-more").click();
		await waitForUpdate();

		// Should be back at the bottom
		await expect
			.element(scrollState())
			.toHaveAttribute("data-at-bottom", "true");
	});
});
