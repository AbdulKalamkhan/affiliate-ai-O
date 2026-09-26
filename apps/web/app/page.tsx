import type { Metadata } from "next";
import { Card, EmptyState, InfoBanner, Kpi, SectionHeading, StatusPill, UnavailableBanner, type Tone } from "./_ui/ui";

export const metadata: Metadata = {
  title: "AI_OS — Affiliate AI CEO & Money Operating System",
  description: "Money-First MVP: opportunity list, affiliate links, click tracking, revenue/profit records, content channel, manual publishing",
};

export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const API_KEY = process.env.API_KEY ?? "";

interface HealthData {
  status: string;
  service?: string;
  database?: string;
}

interface OverviewCounts {
  opportunities: number;
  affiliateLinks: number;
  contentAssets: number;
  publishedAssets: number;
  clicks: number;
  conversions: number;
  profitRecords: number;
}

interface OverviewData {
  at: string;
  counts: OverviewCounts;
  totals: { revenue: number; profit: number };
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

const KEYED = API_KEY ? true : false;

export default async function HomePage() {
  const [health, overview, registry] = await Promise.all([
    getJson<HealthData>("/health").catch(() => null),
    getJson<OverviewData>("/dashboard/overview"),
    getJson<{ configuredCount: number; registeredCount: number; providers: ProviderRow[] }>("/system/providers"),
  ]);

  const apiOk = Boolean(health && health.status === "ok");
  const dbOk = Boolean(health && health.database === "ok");
  const live = overview !== null;
  const configured = registry?.configuredCount ?? 0;
  const totalProviders = registry?.registeredCount ?? 0;
  const rev = overview?.totals.revenue ?? null;
  const profit = overview?.totals.profit ?? null;
  const clicks = overview?.counts.clicks ?? null;
  const conversions = overview?.counts.conversions ?? null;
  const conversionRate = clicks != null && clicks > 0 && conversions != null ? (conversions / clicks) * 100 : null;

  const healthTone: Tone = apiOk && dbOk ? "green" : apiOk ? "amber" : "red";
  const moneyTone: Tone = profit != null && profit > 0 ? "green" : clicks != null && clicks > 0 ? "amber" : "blue";

  return (
    <main>
      <h1>AI_OS — Affiliate AI CEO &amp; Money Operating System</h1>
      <p className="h-sub">
        Money-First MVP: opportunity list · affiliate links · click tracking · revenue/profit records · manual
        Pinterest publishing.
      </p>

      {!live && !apiOk && (
        <UnavailableBanner
          title="API unavailable"
          body={
            <>
              Unable to load live data from <code>{API_BASE}</code>. The API is unreachable or the server-side{" "}
              <code>API_KEY</code> is not set on this web service. No fabricated metrics are shown.
            </>
          }
        />
      )}
      {(!live && apiOk) && (
        <UnavailableBanner
          title={`Unable to load live data${KEYED ? "" : " (server-side API_KEY not set)"}`}
          body="The API is reachable, but the overview requires the server-side API key. Set it on the ai-os-web service to render live numbers."
        />
      )}

      <SectionHeading
        title="System status"
        right={<StatusPill tone={healthTone} label={apiOk && dbOk ? "Healthy" : apiOk ? "API ok / DB degraded" : "Unavailable"} />}
      />

      <div className="kpi-grid">
        <Kpi label="API" tone={apiOk ? "green" : "red"} value={apiOk ? "Reachable" : "Unavailable"} hint={`${API_BASE}`} />
        <Kpi label="Database" tone={dbOk ? "green" : apiOk ? "amber" : "red"} value={dbOk ? "Connected" : "Unknown"} hint="probe via /health" />
        <Kpi
          label="Providers"
          tone={configured > 0 ? "green" : "amber"}
          value={`${configured}/${totalProviders}`}
          hint="configured vs registered adapters"
        />
        <Kpi label="Server-side key" tone={KEYED ? "green" : "amber"} value={KEYED ? "Configured" : "Not set"} hint="needed for live data" />
      </div>

      <SectionHeading title="Money-first dashboard" right={healthTone !== "red" ? <StatusPill tone={moneyTone} label={conversionRate != null ? `${conversionRate.toFixed(1)}% conversion` : "awaiting data"} /> : undefined} />

      {live ? (
        <div className="kpi-grid">
          <Kpi label="Clicks" value={clicks} hint="recorded real traffic" />
          <Kpi label="Conversions" value={conversions} hint="verified (reconciled) events" />
          <Kpi label="Revenue" value={rev != null ? `₹${rev.toLocaleString("en-IN")}` : "—"} tone={rev != null && rev > 0 ? "green" : "amber"} hint="reconciled evidence only" />
          <Kpi label="Profit" value={profit != null ? `₹${profit.toLocaleString("en-IN")}` : "—"} tone={profit != null && profit > 0 ? "green" : "amber"} hint="gross − fee − cost" />
          <Kpi label="Conversion rate" value={conversionRate != null ? `${conversionRate.toFixed(1)}%` : "Awaiting data"} hint={clicks != null && clicks > 0 ? `${clicks} clicks tracked` : "no clicks yet"} />
          <Kpi label="Published pins" value={overview?.counts.publishedAssets ?? 0} hint="content assets live" />
        </div>
      ) : (
        <EmptyState
          title="No live data"
          body="The overview API is not reachable from this page right now. It will refresh automatically once the API (and its server-side key) are available."
        />
      )}

      <SectionHeading title="Navigate" />
      <div className="grid-2">
        <Card>
          <h2 className="card-title">Dashboard</h2>
          <p className="muted" style={{ margin: "0 0 0.6rem" }}>
            Live KPIs — revenue, profit, clicks, conversions, conversion rate, campaigns, concentration risk and
            recent activity.
          </p>
          <p style={{ margin: 0 }}>
            <a href="/dashboard">Open dashboard →</a>
          </p>
        </Card>
        <Card>
          <h2 className="card-title">Command Center</h2>
          <p className="muted" style={{ margin: "0 0 0.6rem" }}>
            Owner commands → plans → tasks → actions with permission state and audit trail, plus integration status.
          </p>
          <p style={{ margin: 0 }}>
            <a href="/command-center">Open command center →</a>
          </p>
        </Card>
        <Card>
          <h2 className="card-title">Campaign Analytics</h2>
          <p className="muted" style={{ margin: "0 0 0.6rem" }}>
            Per-campaign performance from recorded evidence: clicks, conversions, revenue, profit, channels, providers.
          </p>
          <p style={{ margin: 0 }}>
            <a href="/campaigns">Open campaign analytics →</a>
          </p>
        </Card>
        <Card>
          <h2 className="card-title">Scopes &amp; gates</h2>
          <p className="muted" style={{ margin: "0 0 0.6rem" }}>
            Phase-00 Money-First MVP. Business gate stays blocked until real Amazon Associates conversion evidence
            exists — nothing is fabricated.
          </p>
          <p style={{ margin: 0 }}>
            <a href="/dashboard">Review state →</a>
          </p>
        </Card>
      </div>

      <InfoBanner>
        Widgets show recorded evidence only. When a metric has no real data yet it reads <strong>“Awaiting data”</strong> —
        never a fabricated zero.
      </InfoBanner>
    </main>
  );
}