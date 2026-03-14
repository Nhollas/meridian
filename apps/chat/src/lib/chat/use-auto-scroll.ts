import { useEffect, useRef } from "react";
import type { ChatMessageViewModel } from "./view-models";

const AUTO_SCROLL_THRESHOLD_PX = 96;

/**
 * How long (ms) after the user scrolls away from the bottom before
 * auto-scroll can re-engage. This prevents rapid programmatic scroll
 * events from immediately overriding the user's intent.
 */
const USER_SCROLL_COOLDOWN_MS = 1000;

export function useAutoScroll(messages: ChatMessageViewModel[]) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = useRef(true);
	const isProgrammaticScrollRef = useRef(false);
	const userScrolledAtRef = useRef(0);
	const latestMessageFingerprint = getMessageFingerprint(messages.at(-1));

	// biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll should respond to streamed message/tool updates only
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || !shouldAutoScrollRef.current) {
			return;
		}

		isProgrammaticScrollRef.current = true;
		el.scrollTop = el.scrollHeight;
	}, [messages.length, latestMessageFingerprint]);

	function handleScroll() {
		if (isProgrammaticScrollRef.current) {
			isProgrammaticScrollRef.current = false;
			return;
		}

		const el = scrollRef.current;
		if (!el) {
			return;
		}

		const nearBottom = isNearBottom(el);

		if (!nearBottom) {
			shouldAutoScrollRef.current = false;
			userScrolledAtRef.current = Date.now();
		} else if (
			Date.now() - userScrolledAtRef.current >
			USER_SCROLL_COOLDOWN_MS
		) {
			shouldAutoScrollRef.current = true;
		}
	}

	function enableAutoScroll() {
		shouldAutoScrollRef.current = true;
		userScrolledAtRef.current = 0;
	}

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
