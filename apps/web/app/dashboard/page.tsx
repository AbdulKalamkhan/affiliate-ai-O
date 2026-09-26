import type { Metadata } from "next";
import {
  Card,
  EmptyState,
  InfoBanner,
  Kpi,
  Panel,
  SectionHeading,
  StatusPill,
  UnavailableBanner,
  ValueTag,
} from "../_ui/ui";

export const metadata: Metadata = {
  title: "Dashboard — AI_OS",
  description: "AI_OS Phase-00 dashboard: revenue, profit, clicks, conversions, campaigns",
};

export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const API_KEY = process.env.API_KEY ?? "";

interface HealthData {
  status: string;
  service?: string;
  database?: string;
}

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

interface OverviewConcentration {
  totalRevenue: number;
  currency: string;
  providerCount: number;
  concentrationThresholdPct: number;
  riskAlerts: { provider: string; amount: number; sharePct: number }[];
  providers: { provider: string; amount: number; currency: string; sharePct: number; riskAlert: boolean }[];
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
  concentration: OverviewConcentration;
  recentLinks: OverviewRecentLink[];
  recentAssets: OverviewRecentAsset[];
  recentRevenueEvents: OverviewRecentEvent[];
}

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

interface ProviderRow {
  name: string;
  kind: string;
  configured: boolean;
  status: string;
  description: string;
  activation: string;
  requiredEnvNames: string[];
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

export default async function DashboardPage() {
  const [health, data, campaigns, registry] = await Promise.all([
    getJson<HealthData>("/health").catch(() => null),
    getJson<OverviewData>("/dashboard/overview"),
    getJson<CampaignOverview>("/campaign-analytics/overview"),
    getJson<{ configuredCount: number; registeredCount: number; providers: ProviderRow[] }>("/system/providers"),
  ]);

  const apiOk = Boolean(health && health.status === "ok");
  const dbOk = Boolean(health && health.database === "ok");
  const live = data !== null;

  const clicks = data?.counts.clicks ?? null;
  const conversions = data?.counts.conversions ?? null;
  const revenue = data?.totals.revenue ?? null;
  const profit = data?.totals.profit ?? null;
  const rate = clicks != null && clicks > 0 && conversions != null ? (conversions / clicks) * 100 : null;
  const activeCampaigns = campaigns ? campaigns.campaigns.filter((c) => c.campaign !== "(uncategorized)").length : null;
  const configuredProviders = registry?.configuredCount ?? null;
  const registeredProviders = registry?.registeredCount ?? null;

  if (!live && !apiOk) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p className="h-sub">Clicks, conversions, revenue, profit — from recorded evidence.</p>
        <UnavailableBanner
          title="API unavailable"
          body={
            <>
              Could not reach <code>{API_BASE}</code>. The API is unreachable or the server-side{" "}
              <code>API_KEY</code> is not set on the web service. No metrics are fabricated while offline.
            </>
          }
        />
      </main>
    );
  }

  return (
    <main>
      <div className="section-head" style={{ marginBottom: "0.4rem" }}>
        <h1>Dashboard</h1>
        <span className="tag">{data?.at ?? "—"}</span>
      </div>
      <p className="h-sub">Clicks, conversions, revenue, profit — from recorded evidence.</p>

      {!live && apiOk && (
        <UnavailableBanner
          title="Unable to load live data"
          body="The API is reachable but the overview requires the server-side API key (not set on this web service yet)."
        />
      )}

      <SectionHeading
        title="Primary KPIs"
        right={<StatusPill tone={profit != null && profit > 0 ? "green" : clicks != null && clicks > 0 ? "amber" : "blue"} label={rate != null ? `${rate.toFixed(1)}% conversion` : "awaiting data"} />}
      />

      {live ? (
        <div className="kpi-grid">
          <Kpi label="Revenue" value={inr(revenue ?? 0)} tone={revenue != null && revenue > 0 ? "green" : "amber"} hint="reconciled evidence only" />
          <Kpi label="Profit" value={inr(profit ?? 0)} tone={profit != null && profit > 0 ? "green" : "amber"} hint="gross − fee − cost" />
          <Kpi label="Clicks" value={clicks} hint="recorded real traffic" />
          <Kpi label="Conversions" value={conversions} hint="verified (reconciled) events" />
          <Kpi label="Conversion rate" value={rate != null ? `${rate.toFixed(2)}%` : "Awaiting data"} hint={clicks != null && clicks > 0 ? `${clicks} clicks tracked` : "no clicks yet"} />
          <Kpi label="Active campaigns" value={activeCampaigns ?? "Awaiting data"} hint={campaigns ? "from campaign analytics" : "campaign data unavailable"} />
          <Kpi label="Published assets" value={data?.counts.publishedAssets ?? 0} hint={data ? `of ${data.counts.contentAssets} assets` : undefined} />
          <Kpi label="Providers" value={configuredProviders != null ? `${configuredProviders}/${registeredProviders}` : "Awaiting data"} tone={configuredProviders != null && configuredProviders > 0 ? "green" : "amber"} hint="configured vs registered" />
        </div>
      ) : (
        <EmptyState title="No live data" body="Overview is unavailable right now. It will render automatically when the server-side key is configured." />
      )}

      {live && (
        <>
          <SectionHeading title="Campaigns" right={<StatusPill tone={activeCampaigns != null && activeCampaigns > 0 ? "green" : "blue"} label={activeCampaigns != null ? `${activeCampaigns} active` : "awaiting data"} />} />
          {campaigns && campaigns.campaigns.length > 0 ? (
            <div className="campaign-cards">
              {campaigns.campaigns.map((c) => (
                <Card key={c.campaign}>
                  <div className="card-title">
                    <h2>{c.campaign === "(uncategorized)" ? "Uncategorized" : c.campaign}</h2>
                    {c.campaign === "(uncategorized)" && <ValueTag>untagged</ValueTag>}
                  </div>
                  <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div className="kpi-label">Clicks</div>
                    <div style={{ textAlign: "right", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{c.clicks}</div>
                    <div className="kpi-label">Conversions</div>
                    <div style={{ textAlign: "right", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{c.conversions}</div>
                    <div className="kpi-label">Revenue</div>
                    <div style={{ textAlign: "right", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{inr(c.revenue)}</div>
                    <div className="kpi-label">Profit</div>
                    <div style={{ textAlign: "right", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{inr(c.profit)}</div>
                  </div>
                  <p className="muted" style={{ fontSize: "0.8rem", margin: "0.6rem 0 0" }}>
                    {c.linkCount} link(s) · {c.providerCount} provider(s) ·{" "}
                    {c.channels.length > 0 ? c.channels.join(", ") : "no channel"}
                  </p>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="No campaigns yet" body="Campaign links, clicks and reconciled revenue will appear here once recorded evidence exists. Campaign #3 is awaiting real conversion data." />
          )}

          <SectionHeading title="Revenue concentration" />
          {data.concentration.providerCount === 0 ? (
            <EmptyState title="No verified revenue" body="Per-provider share appears once reconciled revenue is recorded." />
          ) : (
            <Card>
              <ul className="list-plain">
                {data.concentration.providers.map((p) => (
                  <li key={p.provider}>
                    {p.provider}: <strong>{inr(p.amount)}</strong> ({p.sharePct}%)
                    {p.riskAlert && ` ⚠ concentration risk`}
                  </li>
                ))}
              </ul>
              {data.concentration.riskAlerts.length > 0 && (
                <p style={{ color: "var(--red)", margin: "0.5rem 0 0" }}>
                  Risk alert: {data.concentration.riskAlerts.map((r) => r.provider).join(", ")} exceeds{" "}
                  {data.concentration.concentrationThresholdPct}% of verified revenue.
                </p>
              )}
            </Card>
          )}

          <SectionHeading title="Recent links" />
          {data.recentLinks.length === 0 ? (
            <EmptyState title="No links yet" body="Create a link via the API (task-5 generator) and it appears here." />
          ) : (
            <Panel>
              <ul className="list-plain">
                {data.recentLinks.map((link) => (
                  <li key={link.id} className="overflow-safe">
                    <strong>{link.productTitle ?? link.offer ?? link.id}</strong> <span className="muted">· {link.channel}</span>{" "}
                    · <a href={link.destination}>{link.destination}</a> · <strong>{link._count?.clicks ?? 0}</strong> clicks
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <SectionHeading title="Content assets" />
          {data.recentAssets.length === 0 ? (
            <EmptyState title="No pins yet" body="Create a content asset, add the disclosure, and publish." />
          ) : (
            <Panel>
              <ul className="list-plain">
                {data.recentAssets.map((asset) => (
                  <li key={asset.id} className="overflow-safe">
                    <strong>{asset.title}</strong> {asset.published ? <StatusPill tone="green" label="published" /> : <StatusPill tone="amber" label="draft" />}{" "}
                    {asset.disclosureAdded ? <StatusPill tone="green" label="disclosure ✓" /> : <StatusPill tone="red" label="disclosure missing" />} ·{" "}
                    {asset.link._count.clicks} clicks
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <SectionHeading title="Recent revenue events" />
          {data.recentRevenueEvents.length === 0 ? (
            <EmptyState
              title="No revenue recorded"
              body="Awaiting Amazon Associates evidence for Campaign #3. Nothing is created until real conversion/commission evidence arrives."
            />
          ) : (
            <Panel>
              <ul className="list-plain">
                {data.recentRevenueEvents.map((event) => (
                  <li key={event.id} className="overflow-safe">
                    {event.provider} · {event.eventType} · <strong>{inr(event.value)}</strong> {event.currency} · {event.status}
                    {event.netProfit !== null ? ` · profit ${inr(event.netProfit)}` : ""} · <span className="muted">{event.occurredAt}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      <SectionHeading title="System" />
      <div className="grid-2">
        <Panel title="Core health">
          <ul className="list-plain">
            <li>
              API status{" "}
              {apiOk ? <StatusPill tone="green" label="reachable" /> : <StatusPill tone="red" label="unavailable" />}
            </li>
            <li>
              Database{" "}
              {dbOk ? <StatusPill tone="green" label="connected" /> : apiOk ? <StatusPill tone="amber" label="unknown/degraded" /> : <StatusPill tone="red" label="unknown" />}
            </li>
            <li>
              Server-side API key{" "}
              {API_KEY ? <StatusPill tone="green" label="configured" /> : <StatusPill tone="amber" label="not set" />}
            </li>
            <li>
              Error masking <StatusPill tone="green" label="on" />
            </li>
          </ul>
        </Panel>
        <Panel title="Providers & automation">
          {registry && registry.providers.length > 0 ? (
            <ul className="list-plain">
              {registry.providers.map((p) => (
                <li key={p.name} className="overflow-safe">
                  <strong>{p.name}</strong>{" "}
                  {p.configured ? <StatusPill tone="green" label="configured" /> : <StatusPill tone="amber" label="not configured" />}
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    {p.activation}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Provider status unavailable.</p>
          )}
        </Panel>
      </div>

      <InfoBanner>
        Serving <strong>recorded evidence only</strong>. Pending/rejected revenue events never count as conversions, and
        reach/impressions are never inferred. When the underlying value is unknown the UI shows “Awaiting data”, not a
        fabricated zero.
      </InfoBanner>
    </main>
  );
}