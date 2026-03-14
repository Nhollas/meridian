import { useCallback, useEffect, useRef } from "react";
import type { ChatMessageViewModel } from "./view-models";

const AUTO_SCROLL_THRESHOLD_PX = 96;

/**
 * Minimum upward scroll (px) to count as intentional user scroll.
 * Browser rendering jitter can cause 1-3px differences between
 * scroll events from a single programmatic scrollTop assignment.
 */
const USER_SCROLL_UP_THRESHOLD_PX = 5;

/**
 * How long (ms) after the user scrolls up before auto-scroll can
 * re-engage. This prevents content growth from immediately pulling
 * the user back to the bottom after a scroll up.
 */
const USER_SCROLL_COOLDOWN_MS = 1200;

export function useAutoScroll(messages: ChatMessageViewModel[]) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = useRef(true);
	const prevScrollTopRef = useRef(0);
	const userDisengagedAtRef = useRef(0);
	const latestMessageFingerprint = getMessageFingerprint(messages.at(-1));

	// biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll should respond to streamed message/tool updates only
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || !shouldAutoScrollRef.current) {
			return;
		}

		el.scrollTop = el.scrollHeight;
		prevScrollTopRef.current = el.scrollTop;
	}, [messages.length, latestMessageFingerprint]);

	const handleScroll = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}

		const currentScrollTop = el.scrollTop;
		const delta = prevScrollTopRef.current - currentScrollTop;
		prevScrollTopRef.current = currentScrollTop;

		if (delta >= USER_SCROLL_UP_THRESHOLD_PX) {
			// User scrolled up intentionally — disable auto-scroll
			shouldAutoScrollRef.current = false;
			userDisengagedAtRef.current = Date.now();
			return;
		}

		// Only re-engage auto-scroll if the user is near the bottom
		// AND the cooldown has expired
		if (!shouldAutoScrollRef.current) {
			const cooldownExpired =
				Date.now() - userDisengagedAtRef.current > USER_SCROLL_COOLDOWN_MS;
			if (isNearBottom(el) && cooldownExpired) {
				shouldAutoScrollRef.current = true;
			}
		}
	}, []);

	const enableAutoScroll = useCallback(() => {
		shouldAutoScrollRef.current = true;
		userDisengagedAtRef.current = 0;
		prevScrollTopRef.current = 0;
	}, []);

	return { scrollRef, handleScroll, enableAutoScroll };
}

function isNearBottom(element: HTMLDivElement) {
	return (
		element.scrollHeight - element.scrollTop - element.clientHeight <=
		AUTO_SCROLL_THRESHOLD_PX
	);
}

function getMessageFingerprint(message?: ChatMessageViewModel) {
	if (!message) {
		return "";
	}

	const toolCallFingerprint =
		message.toolCalls
			?.map(
				(toolCall) =>
					`${toolCall.id}:${toolCall.status ?? ""}:${toolCall.input?.length ?? 0}:${toolCall.result.length}`,
			)
			.join("|") ?? "";

	return `${message.id}:${message.status ?? ""}:${message.content.length}:${toolCallFingerprint}`;
}
