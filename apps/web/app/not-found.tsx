import Link from "next/link";
import { Card, StatusPill } from "./_ui/ui";

export default function NotFound() {
  return (
    <main>
      <h1>Route not found</h1>
      <p className="h-sub">
        404 — this URL is not a real AI_OS page. The app serves /, /dashboard, /command-center and /campaigns only.
      </p>
      <Card>
        <StatusPill tone="red" label="404" />
        <p className="muted" style={{ margin: "0.6rem 0 0" }}>
          Nothing is fabricated: the requested route does not exist in this system.
        </p>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginTop: "1rem" }}>
          {[
            ["/", "Home"],
            ["/dashboard", "Dashboard"],
            ["/command-center", "Command Center"],
            ["/campaigns", "Campaign Analytics"],
          ].map(([href, label]) => (
            <Link key={href} href={href} style={{ color: "var(--accent)" }}>
              {label}
            </Link>
          ))}
        </nav>
      </Card>
    </main>
  );
}