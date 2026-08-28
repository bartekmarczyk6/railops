import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RailOps Demo",
  description:
    "Local two-page RailOps demo: synthetic rail support cases, evidence-backed AI Agent drafting, and reviewer learning.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div
          data-testid="demo-banner"
          className="border-b border-line bg-surface px-4 py-1.5 text-center text-xs text-ink-2"
        >
          Demo — cases live only in your browser. Reviewer memory is paused and
          AI calls are rate-limited.
        </div>
        {children}
      </body>
    </html>
  );
}