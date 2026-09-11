import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ascend OS — Continuous Progression Hub",
  description: "Your personal progression workstation. Five modules, analog hardware, and a space to make your own.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
