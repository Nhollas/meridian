"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
	h1: ({ children }) => (
		<h1 className="mt-4 mb-2 font-display font-semibold text-lg tracking-tight first:mt-0">
			{children}
		</h1>
	),
	h2: ({ children }) => (
		<h2 className="mt-4 mb-2 font-display font-semibold text-base tracking-tight first:mt-0">
			{children}
		</h2>
	),
	h3: ({ children }) => (
		<h3 className="mt-3 mb-1.5 font-display font-semibold text-sm tracking-tight first:mt-0">
			{children}
		</h3>
	),
	p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
	strong: ({ children }) => (
		<strong className="font-semibold text-text-primary">{children}</strong>
	),
	em: ({ children }) => (
		<em className="text-text-secondary italic">{children}</em>
	),
	a: ({ href, children }) => (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="text-flow underline decoration-flow/40 underline-offset-2 transition-colors hover:decoration-flow"
		>
			{children}
		</a>
	),
	ul: ({ children }) => (
		<ul className="mb-3 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
	),
	ol: ({ children }) => (
		<ol className="mb-3 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
	),
	li: ({ children }) => <li className="pl-0.5">{children}</li>,
	code: ({ className, children }) => {
		const isBlock = className?.includes("language-");
		if (isBlock) {
			return (
				<code className="font-mono text-text-secondary text-xs">
					{children}
				</code>
			);
		}
		return (
			<code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text-primary text-xs">
				{children}
			</code>
		);
	},
	pre: ({ children }) => (
		<pre className="mb-3 max-h-80 overflow-auto rounded-lg border border-border-subtle bg-surface-1 p-3 font-mono text-text-secondary text-xs leading-relaxed last:mb-0">
			{children}
		</pre>
	),
	table: ({ children }) => (
		<div className="mb-3 overflow-auto rounded-lg border border-border-subtle last:mb-0">
			<table className="w-full text-sm">{children}</table>
		</div>
	),
	thead: ({ children }) => (
		<thead className="bg-surface-2 text-left font-medium text-text-secondary text-xs">
			{children}
		</thead>
	),
	tbody: ({ children }) => (
		<tbody className="divide-y divide-border-subtle">{children}</tbody>
	),
	tr: ({ children }) => (
		<tr className="transition-colors hover:bg-surface-1">{children}</tr>
	),
	th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
	td: ({ children }) => (
		<td className="px-3 py-2 text-text-primary">{children}</td>
	),
	blockquote: ({ children }) => (
		<blockquote className="mb-3 border-flow/40 border-l-2 pl-4 text-text-secondary italic last:mb-0">
			{children}
		</blockquote>
	),
	hr: () => <hr className="my-4 border-border-subtle" />,
};

interface MarkdownProps {
	content: string;
}

export function Markdown({ content }: MarkdownProps) {
	return (
		<ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
			{content}
		</ReactMarkdown>
	);
}
