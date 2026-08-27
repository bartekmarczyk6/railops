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
      <body>{children}</body>
    </html>
  );
}