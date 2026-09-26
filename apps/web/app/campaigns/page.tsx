import type { Metadata } from "next";
import { Card, EmptyState, InfoBanner, Kpi, SectionHeading, StatusPill, UnavailableBanner, ValueTag } from "../_ui/ui";

export const metadata: Metadata = {
  title: "Campaign Analytics — AI_OS",
  description: "AI_OS per-campaign performance from recorded evidence",
};

export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const API_KEY = process.env.API_KEY ?? "";

interface CampaignRow {
  campaign: string;
  providerCount: number;
  channels: string[];
  linkCount: number;
  clicks: number;
  conversions: number;
  revenue: number;
  profit: number;
}

interface CampaignOverview {
  at: string;
  campaigns: CampaignRow[];
  totals: { clicks: number; conversions: number; revenue: number; profit: number };
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = {};
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CampaignsPage() {
  const [overview, health] = await Promise.all([
    getJson<CampaignOverview>("/campaign-analytics/overview"),
    getJson<{ status: string }>("/health").catch(() => null),
  ]);

  const apiOk = Boolean(health && health.status === "ok");
  const t = overview
    ? { clicks: overview.totals.clicks, conversions: overview.totals.conversions, revenue: overview.totals.revenue, profit: overview.totals.profit }
    : { clicks: null, conversions: null, revenue: null, profit: null };

  const rate = t.clicks != null && t.clicks > 0 && t.conversions != null ? (t.conversions / t.clicks) * 100 : null;

  return (
    <main>
      <h1>Campaign Analytics</h1>
      <p className="h-sub">
        Per-campaign clicks, conversions, revenue and profit from recorded evidence — never inferred. Reach/impressions
        are not estimated.
      </p>

      {!overview && !apiOk && (
        <UnavailableBanner
          title="API unavailable"
          body={
            <>
              Could not reach <code>{API_BASE}</code> or authentication failed. Set the server-side{" "}
              <code>API_KEY</code> to render live campaign metrics.
            </>
          }
        />
      )}
      {!overview && apiOk && (
        <UnavailableBanner
          title="Unable to load live data"
          body="The campaign analytics feed requires the server-side API key (not set on this web service yet)."
        />
      )}

      <div className="kpi-grid">
        <Kpi label="Campaigns" value={overview ? overview.campaigns.length : "Awaiting data"} hint="with evidence" />
        <Kpi label="Clicks" value={t.clicks ?? "Awaiting data"} hint="real recorded traffic" />
        <Kpi label="Conversions" value={t.conversions ?? "Awaiting data"} hint="verified (reconciled) events" />
        <Kpi label="Conversion rate" value={rate != null ? `${rate.toFixed(2)}%` : "Awaiting data"} hint={t.clicks != null && t.clicks > 0 ? `${t.clicks} clicks tracked` : "no clicks yet"} />
        <Kpi label="Revenue" value={t.revenue != null ? inr(t.revenue) : "Awaiting data"} tone={t.revenue != null && t.revenue > 0 ? "green" : "amber"} hint="reconciled evidence only" />
        <Kpi label="Profit" value={t.profit != null ? inr(t.profit) : "Awaiting data"} tone={t.profit != null && t.profit > 0 ? "green" : "amber"} hint="gross − fee − cost" />
      </div>

      <SectionHeading
        title="Campaigns"
        right={overview ? <StatusPill tone={overview.campaigns.length > 0 ? "green" : "blue"} label={`${overview.campaigns.length} tracked`} /> : undefined}
      />

      {overview === null ? (
        <EmptyState title="Campaign data unavailable" body="The analytics feed is not reachable right now (server-side API key)." />
      ) : overview.campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns with evidence"
          body={
            <>
              Campaign #3 (<span className="mono">dhruvs-nazariya-anklet-c3</span>) has recorded clicks waiting for
              Amazon Associates conversion evidence. Metrics appear here the moment real data exists. Everything is
              currently <strong>“Awaiting data”</strong> — nothing is fabricated, no zeros are invented.
            </>
          }
        />
      ) : (
        <div className="campaign-cards">
          {overview.campaigns.map((c) => {
            const cRate = c.clicks > 0 ? (c.conversions / c.clicks) * 100 : null;
            return (
              <Card key={c.campaign}>
                <div className="card-title">
                  <h2 className="overflow-safe">{c.campaign === "(uncategorized)" ? "Uncategorized" : c.campaign}</h2>
                  {c.campaign === "(uncategorized)" && <ValueTag>untagged</ValueTag>}
                </div>
                <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <div className="kpi-label">Links</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.linkCount}</div>
                  <div className="kpi-label">Providers</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.providerCount}</div>
                  <div className="kpi-label">Channels</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.channels.length > 0 ? c.channels.join(", ") : "—"}</div>
                  <div className="kpi-label">Clicks</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.clicks}</div>
                  <div className="kpi-label">Conversions</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.conversions}</div>
                  <div className="kpi-label">Conversion rate</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cRate != null ? `${cRate.toFixed(2)}%` : "Awaiting data"}</div>
                  <div className="kpi-label">Revenue</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(c.revenue)}</div>
                  <div className="kpi-label">Profit</div>
                  <div style={{ fontWeight: 650, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(c.profit)}</div>
                </div>
                <p className="muted" style={{ margin: "0.6rem 0 0", fontSize: "0.8rem" }}>
                  Close rate reflects reconciled conversions only; pending/rejected events never count.
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <InfoBanner>
        This page is read-only and evidence-based. Reach, impressions and commissions are shown only when the provider
        reports them — otherwise “Awaiting data”.
      </InfoBanner>
    </main>
  );
}