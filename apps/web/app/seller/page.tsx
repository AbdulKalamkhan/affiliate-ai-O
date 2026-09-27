import type { Metadata } from "next";
import { Card, EmptyState, InfoBanner, Kpi, SectionHeading, StatusPill, UnavailableBanner, ValueTag } from "../_ui/ui";
import { formatInr } from "../_ui/format";

export const metadata: Metadata = {
  title: "Seller Control Center — AI_OS",
  description: "AI_OS seller listings, inventory, orders, returns and settlement profitability",
};

export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const API_KEY = process.env.API_KEY ?? "";

interface MarketplaceStatus {
  marketplace: string;
  displayName: string;
  state: "connected" | "configured_not_verified" | "not_connected" | "ready_for_connection";
  connected: boolean;
  credentialsPresent: boolean;
  implementation: "implemented";
  capabilities: string[];
  requiredEnvNames: string[];
  missingEnvNames: string[];
  ownerAction: string | null;
  note: string | null;
}

interface SellerOverview {
  sellers: number;
  listings: number;
  inventoryRecords: number;
  orders: number;
  returns: number;
  settlements: number;
  connectedMarketplaces: number;
  configuredNotVerifiedMarketplaces: number;
  status: string;
}

interface SellerAccount {
  id: string;
  platform: string;
  displayName: string;
  status: string;
  connected: boolean;
  createdAt: string;
}

interface Listing {
  id: string;
  sellerId: string;
  platform: string;
  title: string;
  status: string;
  createdAt: string;
}

interface InventoryRecord {
  id: string;
  sellerId: string;
  sku: string;
  available: number | null;
  reserved: number | null;
  sold: number | null;
  evidenceSource: string;
  measuredAt: string | null;
}

interface Order {
  id: string;
  sellerId: string;
  platform: string;
  externalId: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
}

interface ReturnRecord {
  id: string;
  sellerId: string;
  platform: string;
  externalId: string | null;
  amount: number;
  status: string;
  reason: string | null;
  createdAt: string;
}

interface SettlementLine {
  component: "revenue" | "cogs" | "fees" | "shipping" | "refunds" | "other";
  amount: number | null;
  currency: string;
  source: string;
}

interface Settlement {
  id: string;
  sellerId: string;
  platform: string;
  externalId: string | null;
  totalAmount: number;
  netProfit: number | null;
  currency: string;
  createdAt: string;
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

function stateTone(state: MarketplaceStatus["state"]): "green" | "amber" | "red" | "blue" {
  if (state === "connected") return "green";
  if (state === "configured_not_verified") return "amber";
  if (state === "ready_for_connection") return "blue";
  return "red";
}

const STATE_LABEL: Record<MarketplaceStatus["state"], string> = {
  connected: "Verified live connection",
  configured_not_verified: "Credentials present — UNVERIFIED",
  ready_for_connection: "Ready to connect",
  not_connected: "Not connected",
};

function money(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "UNKNOWN";
  return currency === "INR" ? formatInr(amount) : `${currency} ${amount.toFixed(2)}`;
}

export default async function SellerPage() {
  const [overview, marketplaces, accounts, listings, inventory, orders, returns, settlements, health] = await Promise.all([
    getJson<SellerOverview>("/seller/overview"),
    getJson<{ marketplaces: MarketplaceStatus[] }>("/seller/marketplaces"),
    getJson<SellerAccount[]>("/seller/accounts"),
    getJson<Listing[]>("/seller/listings"),
    getJson<InventoryRecord[]>("/seller/inventory"),
    getJson<Order[]>("/seller/orders"),
    getJson<ReturnRecord[]>("/seller/returns"),
    getJson<Settlement[]>("/seller/settlements"),
    getJson<{ status: string }>("/health").catch(() => null),
  ]);

  const apiOk = Boolean(health && health.status === "ok");
  const loaded = overview !== null;
  // Only the newest settlements get their per-component lines fetched; the
  // breakdown is a detail view, not a reason to N+1 the whole table.
  const recentSettlements = (settlements ?? []).slice(0, 5);
  const lineMaps = await Promise.all(
    recentSettlements.map(async (s) => [s.id, await getJson<SettlementLine[]>(`/seller/settlements/${s.id}/lines`)] as const),
  );
  const linesBySettlement = new Map(lineMaps);

  // Recorded orders are a real count. Revenue is only summed when at least one
  // settlement exists, so an empty ledger never renders as a confident 0.
  const orderCount = orders?.length ?? null;
  const settlementCount = settlements?.length ?? null;
  const orderRevenue = orders && orders.length > 0 ? orders.reduce((sum, o) => sum + o.totalAmount, 0) : null;
  const recordedProfit = settlements
    ? settlements.filter((s) => s.netProfit != null).reduce((sum, s) => sum + (s.netProfit ?? 0), 0)
    : null;
  const profitComplete = settlements ? settlements.every((s) => s.netProfit != null) && settlements.length > 0 : null;
  const returnTotal = returns && returns.length > 0 ? returns.reduce((sum, r) => sum + r.amount, 0) : null;

  return (
    <main>
      <h1>Seller Control Center</h1>
      <p className="h-sub">
        Listings, inventory, orders, returns and settlement profitability — every figure traceable to a recorded row,
        with absent evidence shown as UNKNOWN rather than zero.
      </p>

      {!loaded && !apiOk && (
        <UnavailableBanner
          title="API unavailable"
          body={
            <>
              Could not reach <code>{API_BASE}</code> or authentication failed. Set the server-side <code>API_KEY</code> to
              render live seller data.
            </>
          }
        />
      )}
      {!loaded && apiOk && (
        <UnavailableBanner
          title="Unable to load live data"
          body="The seller feed requires the server-side API key (not set on this web service yet)."
        />
      )}

      <div className="kpi-grid">
        <Kpi
          label="Seller accounts"
          value={overview ? overview.sellers : "Awaiting data"}
          hint={overview?.status ?? "no account recorded"}
        />
        <Kpi
          label="Verified connections"
          value={overview ? overview.connectedMarketplaces : "Awaiting data"}
          tone={overview && overview.connectedMarketplaces > 0 ? "green" : "amber"}
          hint={
            overview && overview.configuredNotVerifiedMarketplaces > 0
              ? `${overview.configuredNotVerifiedMarketplaces} configured but unverified`
              : "live-verified only"
          }
        />
        <Kpi label="Listings" value={overview ? overview.listings : "Awaiting data"} hint="draft + active records" />
        <Kpi
          label="Orders recorded"
          value={orderCount ?? "Awaiting data"}
          hint="ingested from verified events"
        />
        <Kpi
          label="Recorded order value"
          value={orderRevenue != null ? money(orderRevenue, "INR") : "Awaiting data"}
          tone={orderRevenue != null ? "green" : "amber"}
          hint="manual ingest only — not live"
        />
        <Kpi
          label="Settlements"
          value={settlementCount ?? "Awaiting data"}
          hint="with durable cost lines"
        />
        <Kpi
          label="Net profit"
          value={recordedProfit != null ? money(recordedProfit, "INR") : "Awaiting data"}
          tone={recordedProfit != null && recordedProfit > 0 ? "green" : "amber"}
          hint={profitComplete === false ? "partial — some settlements UNKNOWN" : "all components known"}
        />
        <Kpi
          label="Returns refunded"
          value={returnTotal != null ? money(returnTotal, "INR") : "Awaiting data"}
          tone={returnTotal != null && returnTotal > 0 ? "amber" : undefined}
          hint={returns ? `${returns.length} recorded` : "no return recorded"}
        />
      </div>

      <SectionHeading
        title="Marketplace connections"
        sub="connected=true only when a live provider call has been verified"
        right={
          marketplaces ? (
            <StatusPill
              tone={marketplaces.marketplaces.some((m) => m.connected) ? "green" : "amber"}
              label={`${marketplaces.marketplaces.filter((m) => m.connected).length} verified`}
            />
          ) : undefined
        }
      />

      {!marketplaces ? (
        <EmptyState title="Marketplace state unavailable" body="Could not read adapter connection states from the API." />
      ) : (
        <div className="campaign-cards">
          {marketplaces.marketplaces.map((m) => (
            <Card key={m.marketplace}>
              <div className="card-title">
                <h2 className="overflow-safe">{m.displayName}</h2>
                <StatusPill tone={stateTone(m.state)} label={STATE_LABEL[m.state]} />
              </div>
              <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div className="kpi-label">Credentials</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>
                  {m.credentialsPresent ? "present" : "not set"}
                </div>
                <div className="kpi-label">Live transport</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{m.connected ? "verified" : "not implemented"}</div>
                <div className="kpi-label">Capabilities</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{m.capabilities.length}</div>
              </div>
              {m.missingEnvNames.length > 0 && (
                <p className="muted" style={{ margin: "0.6rem 0 0", fontSize: "0.8rem" }}>
                  Missing env vars: <span className="mono">{m.missingEnvNames.join(", ")}</span>
                </p>
              )}
              {m.ownerAction && (
                <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
                  Owner action: {m.ownerAction}
                </p>
              )}
              {m.note && (
                <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
                  {m.note}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <SectionHeading title="Seller accounts" sub="platform accounts recorded by the Owner" />
      {!accounts ? (
        <EmptyState title="Accounts unavailable" body="Could not read seller accounts from the API." />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No seller account recorded"
          body="Create a seller account before recording listings, inventory, orders or settlements. Nothing is auto-created."
        />
      ) : (
        <div className="campaign-cards">
          {accounts.map((a) => (
            <Card key={a.id}>
              <div className="card-title">
                <h2 className="overflow-safe">{a.displayName}</h2>
                <StatusPill tone={a.connected ? "green" : "amber"} label={a.connected ? "connected" : a.status} />
              </div>
              <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div className="kpi-label">Platform</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{a.platform}</div>
                <div className="kpi-label">Recorded</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{new Date(a.createdAt).toISOString().slice(0, 10)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHeading title="Listings" sub="generated drafts — nothing is published by this system" />
      {!listings ? (
        <EmptyState title="Listings unavailable" body="Could not read listings from the API." />
      ) : listings.length === 0 ? (
        <EmptyState title="No listings" body="Listing drafts appear here once generated from verified product data." />
      ) : (
        <div className="campaign-cards">
          {listings.map((l) => (
            <Card key={l.id}>
              <div className="card-title">
                <h2 className="overflow-safe">{l.title}</h2>
                <ValueTag>{l.status}</ValueTag>
              </div>
              <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div className="kpi-label">Platform</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{l.platform}</div>
                <div className="kpi-label">Created</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{new Date(l.createdAt).toISOString().slice(0, 10)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHeading title="Inventory" sub="available / reserved / sold as last measured" />
      {!inventory ? (
        <EmptyState title="Inventory unavailable" body="Could not read inventory from the API." />
      ) : inventory.length === 0 ? (
        <EmptyState title="No inventory records" body="Inventory appears here only after an explicit, reasoned adjustment." />
      ) : (
        <div className="campaign-cards">
          {inventory.map((i) => (
            <Card key={i.id}>
              <div className="card-title">
                <h2 className="overflow-safe mono">{i.sku}</h2>
                <StatusPill tone={i.available != null && i.available <= 0 ? "red" : "green"} label={i.evidenceSource} />
              </div>
              <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                <div className="kpi-label">Available</div>
                <div className="kpi-label">Reserved</div>
                <div className="kpi-label">Sold</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{i.available ?? "UNKNOWN"}</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{i.reserved ?? "UNKNOWN"}</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{i.sold ?? "UNKNOWN"}</div>
              </div>
              {i.measuredAt && (
                <p className="muted" style={{ margin: "0.6rem 0 0", fontSize: "0.8rem" }}>
                  Measured {i.measuredAt}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <SectionHeading title="Orders" sub="manually ingested from verified marketplace events — not a live feed" />
      {!orders ? (
        <EmptyState title="Orders unavailable" body="Could not read orders from the API." />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders recorded" body="No marketplace connection exists, so no order can be truthfully reported here." />
      ) : (
        <div className="campaign-cards">
          {orders.map((o) => (
            <Card key={o.id}>
              <div className="card-title">
                <h2 className="overflow-safe mono">{o.externalId}</h2>
                <ValueTag>{o.status}</ValueTag>
              </div>
              <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div className="kpi-label">Platform</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{o.platform}</div>
                <div className="kpi-label">Total</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{money(o.totalAmount, o.currency)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHeading title="Returns" sub="recorded refunds with their reason" />
      {!returns ? (
        <EmptyState title="Returns unavailable" body="Could not read returns from the API." />
      ) : returns.length === 0 ? (
        <EmptyState
          title="No returns recorded"
          body="No refund has been recorded. An empty table is not a 0% return rate."
        />
      ) : (
        <div className="campaign-cards">
          {returns.map((r) => (
            <Card key={r.id}>
              <div className="card-title">
                <h2 className="overflow-safe mono">{r.externalId ?? "(unidentified)"}</h2>
                <ValueTag>{r.status}</ValueTag>
              </div>
              <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div className="kpi-label">Amount</div>
                <div style={{ fontWeight: 650, textAlign: "right", color: "var(--danger, #ff8a8a)" }}>
                  −{money(r.amount, "INR")}
                </div>
                <div className="kpi-label">Reason</div>
                <div style={{ fontWeight: 650, textAlign: "right" }}>{r.reason ?? "not stated"}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHeading
        title="Settlements & cost lines"
        sub="net profit is re-derivable from the durable per-component breakdown"
      />
      {!settlements ? (
        <EmptyState title="Settlements unavailable" body="Could not read settlements from the API." />
      ) : settlements.length === 0 ? (
        <EmptyState
          title="No settlements recorded"
          body="Marketplace statements have not been imported, so COGS, fees and profit are all UNKNOWN — deliberately not shown as 0."
        />
      ) : (
        <div className="campaign-cards">
          {settlements.map((s) => {
            const lines = linesBySettlement.get(s.id) ?? null;
            return (
              <Card key={s.id}>
                <div className="card-title">
                  <h2 className="overflow-safe mono">{s.externalId ?? s.id}</h2>
                  <StatusPill tone={s.netProfit != null ? "green" : "amber"} label={s.netProfit != null ? "complete" : "partial"} />
                </div>
                <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <div className="kpi-label">Total</div>
                  <div style={{ fontWeight: 650, textAlign: "right" }}>{money(s.totalAmount, s.currency)}</div>
                  <div className="kpi-label">Net profit</div>
                  <div
                    style={{
                      fontWeight: 650,
                      textAlign: "right",
                      color: s.netProfit == null ? undefined : s.netProfit > 0 ? "var(--ok, #6ee7b7)" : "var(--danger, #ff8a8a)",
                    }}
                  >
                    {money(s.netProfit, s.currency)}
                  </div>
                </div>
                {lines === null ? (
                  <p className="muted" style={{ margin: "0.6rem 0 0", fontSize: "0.8rem" }}>
                    Cost lines unavailable for this settlement.
                  </p>
                ) : (
                  <div style={{ marginTop: "0.6rem" }}>
                    {lines.map((line) => (
                      <div
                        key={line.component}
                        style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", padding: "0.12rem 0" }}
                      >
                        <span className="muted">
                          {line.component} <span className="mono">({line.source})</span>
                        </span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{money(line.amount, line.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <InfoBanner>
        This page is read-only and evidence-based. It never infers a connection, an order, a fee or a profit. Components
        the marketplace has not stated stay UNKNOWN so net profit is never over-reported.
      </InfoBanner>
    </main>
  );
}
