"use client";

import { useEffect, useRef, useState } from "react";

interface ChatInputProps {
	onSend: (message: string) => void;
	disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (!disabled) textareaRef.current?.focus();
	}, [disabled]);

	function handleSubmit() {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		setValue("");
		if (textareaRef.current) textareaRef.current.style.height = "auto";
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function handleInput() {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}

	return (
		<div className="border-border border-t bg-surface-0">
			<div className="mx-auto flex max-w-4xl items-end gap-3 px-6 py-4">
				<textarea
					ref={textareaRef}
					aria-label="Message Meridian"
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
						handleInput();
					}}
					onKeyDown={handleKeyDown}
					placeholder={disabled ? "Thinking..." : "Message Meridian..."}
					disabled={disabled}
					rows={1}
					className="min-h-10 flex-1 resize-none rounded-lg border border-border bg-surface-1 px-4 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-flow disabled:opacity-50"
				/>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={disabled || !value.trim()}
					aria-label="Send message"
					className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-flow text-surface-0 transition-opacity hover:opacity-90 disabled:opacity-30"
				>
					<svg
						aria-hidden="true"
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M14 2L7 9" />
						<path d="M14 2l-5 12-2-5-5-2 12-5z" />
					</svg>
				</button>
			</div>
		</div>
	);
}
