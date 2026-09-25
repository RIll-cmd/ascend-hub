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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function isExtensionError(err) {
                  if (!err) return false;
                  var str = String((err && (err.stack || err.message)) || err);
                  return (
                    str.indexOf('chrome-extension://') !== -1 ||
                    str.indexOf('moz-extension://') !== -1 ||
                    str.indexOf('safari-extension://') !== -1 ||
                    str.indexOf('M_ID') !== -1
                  );
                }
                window.addEventListener('unhandledrejection', function(event) {
                  if (isExtensionError(event.reason)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                  }
                }, true);
                window.addEventListener('error', function(event) {
                  if (
                    isExtensionError(event.error) ||
                    (event.filename && (
                      event.filename.indexOf('chrome-extension://') !== -1 ||
                      event.filename.indexOf('moz-extension://') !== -1
                    ))
                  ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                  }
                }, true);
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
