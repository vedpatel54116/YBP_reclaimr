import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME } from "@reclaimr/shared";
import { LiquidGlassFilter, ThemeProvider, ToastProvider, themeInitScript } from "@reclaimr/ui";
import "./globals.css";

// Body: Inter · Headings: Space Grotesk · Numbers & amounts: JetBrains Mono.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: "Find unwanted subscriptions, cancel them, and reclaim your money.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      // The theme init script mutates the class before hydration.
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Applies the persisted theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body
        suppressHydrationWarning
        className="flex min-h-dvh flex-col bg-background font-sans text-foreground"
      >
        {/* SVG displacement filter used by every .liquid-glass surface. */}
        <LiquidGlassFilter />
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
