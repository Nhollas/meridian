import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, DM_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const display = Bricolage_Grotesque({
	subsets: ["latin"],
	variable: "--font-display",
	display: "swap",
});

const body = DM_Sans({
	subsets: ["latin"],
	variable: "--font-body",
	display: "swap",
});

const mono = DM_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Meridian Chat",
	description: "Chat with the Meridian comparison agent",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			className={`${display.variable} ${body.variable} ${mono.variable}`}
			suppressHydrationWarning
		>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme script prevents FOUC
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}else if(window.matchMedia("(prefers-color-scheme:light)").matches){document.documentElement.setAttribute("data-theme","light")}}catch(e){}})()`,
					}}
				/>
			</head>
			<body className="dot-grid h-dvh overflow-hidden antialiased">
				<div className="relative z-10 flex h-full flex-col">
					<main className="flex min-h-0 flex-1 flex-col">
						<Providers>{children}</Providers>
					</main>
				</div>
			</body>
		</html>
	);
}
