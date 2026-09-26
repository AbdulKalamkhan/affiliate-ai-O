import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI_OS — Phase 00",
  description: "Affiliate AI CEO & Money Operating System — Money-First MVP",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/command-center", label: "Command Center" },
  { href: "/campaigns", label: "Campaign Analytics" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                ◆
              </span>
              AI_OS
            </a>
            <nav className="topnav" aria-label="Primary">
              {NAV.map((item) => (
                <a key={item.href} className="navlink" href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="topbar-right">
              <span className="tag">Money Operating System</span>
            </div>
          </header>

          {children}

          <footer className="footer">
            <span>AI_OS — Affiliate AI CEO · Phase-00 Money-First MVP</span>
            <span>Data rendered from recorded evidence only · never fabricated</span>
          </footer>
        </div>
      </body>
    </html>
  );
}