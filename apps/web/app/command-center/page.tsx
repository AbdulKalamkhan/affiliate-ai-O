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
  type Tone,
} from "../_ui/ui";

export const metadata: Metadata = {
  title: "Command Center — AI_OS",
  description: "AI_OS Owner Command Center: commands → plans → actions, permission state, audit, integration status",
};

export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const API_KEY = process.env.API_KEY ?? "";

interface BossAction {
  id: string;
  tool: string;
  autonomyLevel: number;
  requiredAutonomy: number;
  permissionResult: string;
  status: string;
}

interface BossTask {
  id: string;
  order: number;
  title: string;
  status: string;
  actions: BossAction[];
}

interface BossAuditLog {
  id: string;
  entityType: string;
  entityId: string;
  verb: string;
  createdAt: string;
}

interface BossPlan {
  id: string;
  objective: string;
  status: string;
  tasks: BossTask[];
}

interface BossCommandRow {
  id: string;
  text: string;
  autonomyLevel: number;
  status: string;
  createdAt: string;
  plan: BossPlan | null;
  auditLogs: BossAuditLog[];
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

const actionTone = (action: BossAction): Tone => {
  if (action.status === "executed") return "green";
  if (action.permissionResult === "denied") return "red";
  if (action.status === "proposed") return "blue";
  return "amber";
};

export default async function CommandCenterPage() {
  const [commands, registry] = await Promise.all([
    getJson<BossCommandRow[]>("/boss/commands"),
    getJson<{ configuredCount: number; registeredCount: number; providers: ProviderRow[] }>("/system/providers"),
  ]);

  const connected = commands !== null && registry !== null;
  const configured = registry?.configuredCount ?? null;
  const registered = registry?.registeredCount ?? null;
  const commandCount = commands?.length ?? null;
  const plannedCount = commands?.filter((c) => c.status === "planned" || c.status === "archived").length ?? null;
  const denied = commands?.flatMap((c) => c.plan?.tasks.flatMap((t) => t.actions.filter((a) => a.permissionResult === "denied")) ?? []).length ?? null;

  return (
    <main>
      <h1>Command Center</h1>
      <p className="h-sub">
        Owner → Boss / AI CEO → plan → tasks → actions → permission → execution (proposed-only) → audit. Owner is final
        authority.
      </p>

      {!connected && (
        <UnavailableBanner
          title="API unavailable"
          body={
            <>
              Could not reach <code>{API_BASE}</code> or authentication failed. Set the server-side{" "}
              <code>API_KEY</code> on the web service to see commands and integrations.
            </>
          }
        />
      )}

      <div className="kpi-grid">
        <Kpi label="Commands" value={commandCount ?? "Awaiting data"} hint="owner-issued commands" />
        <Kpi label="Planned" value={plannedCount ?? "—"} hint="planned + archived" />
        <Kpi label="Denied actions" value={denied ?? "—"} hint="permission denials at current autonomy" />
        <Kpi label="Integrations" value={configured != null ? `${configured}/${registered}` : "Awaiting data"} tone={configured != null && configured > 0 ? "green" : "amber"} hint="configured vs registered" />
      </div>

      <SectionHeading
        title="Boss / AI CEO"
        right={<StatusPill tone={connected ? "blue" : "amber"} label={connected ? "channel connected" : "awaiting data"} />}
      />

      {commands === null ? (
        <EmptyState title="Commands unavailable" body="The /boss/commands feed is not reachable right now (server-side API key)." />
      ) : commands.length === 0 ? (
        <EmptyState
          title="No owner commands yet"
          body={
            <>
              POST one via <code>POST /boss/commands</code> and it appears here as a structured, auditable plan. Nothing
              executes — actions are stored as proposals only.
            </>
          }
        />
      ) : (
        commands.map((command) => (
          <Card key={command.id} style={{ marginBottom: "1rem" }}>
            <div className="card-title">
              <h2>{command.text}</h2>
              <StatusPill tone={command.status === "archived" ? "amber" : command.status === "planned" ? "blue" : "amber"} label={command.status} />
            </div>
            <p className="dim" style={{ margin: "0 0 0.8rem" }}>
              autonomy {command.autonomyLevel} · <span className="mono">{command.createdAt}</span>
            </p>
            {!command.plan && <p className="muted">No structured plan generated.</p>}
            {command.plan && (
              <>
                <div className="card-title" style={{ marginTop: "0.4rem" }}>
                  <h2>Objective</h2>
                  <StatusPill tone="blue" label={command.plan.status} />
                </div>
                <p style={{ margin: "0 0 0.8rem", color: "var(--text-dim)" }}>{command.plan.objective}</p>
                {command.plan.tasks.length === 0 && <p className="muted">No tasks generated.</p>}
                <ul className="list-plain">
                  {command.plan.tasks.map((task) => (
                    <li key={task.id}>
                      <div className="overflow-safe" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <strong>
                          {task.order}. {task.title}
                        </strong>
                        <StatusPill tone="blue" label={task.status} />
                      </div>
                      {task.actions.length > 0 && (
                        <ul className="tree list-plain" style={{ marginTop: "0.4rem" }}>
                          {task.actions.map((action) => (
                            <li key={action.id} className="overflow-safe">
                              <code>{action.tool}</code> · permission <StatusPill tone={actionTone(action)} label={action.permissionResult} /> · required{" "}
                              {action.requiredAutonomy}, at autonomy {action.autonomyLevel} · <span className="dim">{action.status}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {command.auditLogs.length > 0 && (
              <div className="tree" style={{ marginTop: "0.8rem" }}>
                <div className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.3rem" }}>
                  Audit trail
                </div>
                {command.auditLogs.map((a) => (
                  <div key={a.id} className="muted mono" style={{ fontSize: "0.78rem" }}>
                    {a.verb} · {a.entityType} · {a.createdAt}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))
      )}

      <SectionHeading title="Integrations" right={<StatusPill tone={configured != null && configured > 0 ? "green" : "amber"} label={configured != null ? `${configured}/${registered} configured` : "awaiting data"} />} />

      {registry === null ? (
        <EmptyState title="Integration status unavailable" body="The /system/providers feed is not reachable right now." />
      ) : registry.providers.length === 0 ? (
        <EmptyState title="No providers registered" body="The provider registry is empty." />
      ) : (
        <div className="grid-2">
          {registry.providers.map((p) => (
            <Panel key={p.name}>
              <div className="card-title">
                <h2 className="overflow-safe">{p.name}</h2>
                {p.configured ? <StatusPill tone="green" label="configured" /> : <StatusPill tone="amber" label="not configured" />}
              </div>
              <p className="muted" style={{ margin: "0 0 0.4rem", fontSize: "0.9rem" }}>
                {p.description}
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                {p.activation}
              </p>
            </Panel>
          ))}
        </div>
      )}

      <InfoBanner>
        Read-only foundation. This page renders recorded state only — it never creates, mutates, or fabricates data, and
        never executes a tool. Permission results reflect the configured autonomy level.
      </InfoBanner>
    </main>
  );
}