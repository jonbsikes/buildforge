import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildForge",
  description: "Project and cost management for home builders and land developers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#f59e0b" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
