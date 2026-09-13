import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI_OS — Phase 00",
  description: "Affiliate AI CEO & Money Operating System — Money-First MVP",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}