import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — AI_OS",
  description: "AI_OS Phase-00 dashboard: clicks, conversions, profit",
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const API_KEY = process.env.API_KEY ?? "";

export const dynamic = "force-dynamic";

interface OverviewRecentLink {
  id: string;
  provider: string;
  channel: string;
  offer: string | null;
  campaign: string | null;
  productTitle: string | null;
  destination: string;
  createdAt: string;
  contentAssets?: { title: string; publishedAt: string | null }[];
  _count?: { clicks: number };
}

interface OverviewRecentAsset {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  publishedAt: string | null;
  disclosureAdded: boolean;
  link: {
    id: string;
    channel: string;
    destination: string;
    productTitle: string | null;
    _count: { clicks: number };
  };
}

interface OverviewRecentEvent {
  id: string;
  provider: string;
  sourceId: string | null;
  eventType: string;
  value: number;
  currency: string;
  status: string;
  linkId: string | null;
  occurredAt: string;
  netProfit: number | null;
}

interface OverviewData {
  at: string;
  counts: {
    opportunities: number;
    affiliateLinks: number;
    contentAssets: number;
    publishedAssets: number;
    clicks: number;
    conversions: number;
    profitRecords: number;
  };
  totals: { revenue: number; profit: number };
  clicksByChannel: Record<string, number>;
  recentLinks: OverviewRecentLink[];
  recentAssets: OverviewRecentAsset[];
  recentRevenueEvents: OverviewRecentEvent[];
}

async function getOverview(): Promise<OverviewData | null> {
  try {
    const headers: Record<string, string> = {};
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
    const res = await fetch(`${API_BASE}/dashboard/overview`, { cache: "no-store", headers });
    if (!res.ok) return null;
    return (await res.json()) as OverviewData;
  } catch {
    return null;
  }
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "1rem",
  minWidth: 140,
};

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function DashboardPage() {
  const data = await getOverview();

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", margin: "2rem", maxWidth: 960 }}>
      <h1>AI_OS — Dashboard</h1>
      <p>
        <a href="/">← home</a> · Phase-00 scope: clicks, conversions, profit.
      </p>

      {!data ? (
        <p style={{ color: "#a31515" }}>
          ⚠ API unreachable at {API_BASE}. Start the API (<code>npm run dev --workspace @ai-os/api</code>) and
          refresh.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div style={cardStyle}>
              <strong>Clicks</strong>
              <div style={{ fontSize: "1.6rem" }}>{data.counts.clicks}</div>
            </div>
            <div style={cardStyle}>
              <strong>Conversions</strong>
              <div style={{ fontSize: "1.6rem" }}>{data.counts.conversions}</div>
              <small>verified (reconciled) revenue events</small>
            </div>
            <div style={cardStyle}>
              <strong>Revenue (reconciled)</strong>
              <div style={{ fontSize: "1.6rem" }}>{inr(data.totals.revenue)}</div>
            </div>
            <div style={cardStyle}>
              <strong>Profit</strong>
              <div style={{ fontSize: "1.6rem" }}>{inr(data.totals.profit)}</div>
            </div>
            <div style={cardStyle}>
              <strong>Published pins</strong>
              <div style={{ fontSize: "1.6rem" }}>{data.counts.publishedAssets}</div>
              <small>of {data.counts.contentAssets} assets</small>
            </div>
          </div>

          {data.counts.clicks === 0 && data.counts.conversions === 0 && (
            <p style={{ color: "#555" }}>
              No activity yet — publish your first Pinterest pin (from a Task-5 tagged link) and clicks will show
              up here. Phase-00 gate: 1 real click → conversion → commission.
            </p>
          )}

          <h2>Clicks by channel</h2>
          {Object.entries(data.clicksByChannel).length === 0 ? (
            <p style={{ color: "#888" }}>No clicks recorded yet.</p>
          ) : (
            <ul>
              {Object.entries(data.clicksByChannel).map(([channel, n]) => (
                <li key={channel}>
                  {channel}: {n}
                </li>
              ))}
            </ul>
          )}

          <h2>Recent links</h2>
          {data.recentLinks.length === 0 ? (
            <p style={{ color: "#888" }}>No links yet — create one via the API (task 5 generator).</p>
          ) : (
            <ul>
              {data.recentLinks.map((link) => (
                <li key={link.id}>
                  <strong>{link.productTitle ?? link.offer ?? link.id}</strong> ({link.channel}) —{" "}
                  <a href={link.destination}>{link.destination}</a> · {link._count?.clicks ?? 0} clicks
                  {link.contentAssets && link.contentAssets.length > 0
                    ? ` · ${link.contentAssets.map((a) => a.title).join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
          )}

          <h2>Content assets (pins)</h2>
          {data.recentAssets.length === 0 ? (
            <p style={{ color: "#888" }}>No pins yet — create a content asset for a link, add the disclosure, publish.</p>
          ) : (
            <ul>
              {data.recentAssets.map((asset) => (
                <li key={asset.id}>
                  <strong>{asset.title}</strong> — {asset.published ? `published ${asset.publishedAt ?? ""}` : "draft"}
                  {asset.disclosureAdded ? " · disclosure ✓" : " · disclosure MISSING"} · link: {asset.link.channel} ·{" "}
                  {asset.link._count.clicks} clicks
                </li>
              ))}
            </ul>
          )}

          <h2>Recent revenue events</h2>
          {data.recentRevenueEvents.length === 0 ? (
            <p style={{ color: "#888" }}>No revenue events yet.</p>
          ) : (
            <ul>
              {data.recentRevenueEvents.map((event) => (
                <li key={event.id}>
                  {event.provider} · {event.eventType} · {inr(event.value)} {event.currency} · {event.status}
                  {event.netProfit !== null ? ` · profit ${inr(event.netProfit)}` : ""} · {event.occurredAt}
                </li>
              ))}
            </ul>
          )}

          <p style={{ color: "#999", fontSize: "0.85rem" }}>Last refresh: {data.at}</p>
        </>
      )}
    </main>
  );
}