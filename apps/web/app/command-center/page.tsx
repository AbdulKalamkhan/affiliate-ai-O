import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Command Center — AI_OS",
  description: "AI_OS Owner Command Center (Phase-08 read foundation): commands, plans, integration status",
};

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const API_KEY = process.env.API_KEY ?? "";

export const dynamic = "force-dynamic";

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

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
};

export default async function CommandCenterPage() {
  const [commands, providers] = await Promise.all([
    getJson<BossCommandRow[]>("/boss/commands"),
    getJson<{ configuredCount: number; registeredCount: number; providers: ProviderRow[] }>("/system/providers"),
  ]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", margin: "2rem", maxWidth: 960 }}>
      <h1>AI_OS — Command Center</h1>
      <p>
        <a href="/">← home</a> · <a href="/dashboard">dashboard</a> · Phase-08 read foundation (commands, plans,
        integration status).
      </p>

      {!commands && !providers && (
        <p style={{ color: "#a31515" }}>
          ⚠ API unreachable at {API_BASE}. Start the API (<code>npm run dev --workspace @ai-os/api</code>) and refresh.
        </p>
      )}

      {providers && (
        <section style={cardStyle}>
          <h2>Integrations</h2>
          <p>
            {providers.configuredCount}/{providers.registeredCount} configured · status detected from env var name
            presence only (values never exposed).
          </p>
          <ul>
            {providers.providers.map((p) => (
              <li key={p.name}>
                <strong>{p.name}</strong> ({p.kind}) —{" "}
                {p.configured ? (
                  <span style={{ color: "#1e6f1e" }}>configured</span>
                ) : (
                  <span style={{ color: "#a31515" }}>not configured</span>
                )}
                <div style={{ color: "#555", fontSize: "0.9rem" }}>{p.description}</div>
                <div style={{ color: "#777", fontSize: "0.85rem" }}>{p.activation}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {commands && (
        <section>
          <h2>Owner commands → plans → actions</h2>
          {commands.length === 0 ? (
            <p style={{ color: "#888" }}>
              No Boss commands yet. POST one via <code>/boss/commands</code> and it will appear here as a structured,
              auditable plan (Phase-01; actions are always proposals — nothing executes).
            </p>
          ) : (
            commands.map((command) => (
              <div key={command.id} style={cardStyle}>
                <p>
                  <strong>{command.text}</strong>
                </p>
                <p style={{ color: "#555" }}>
                  status: {command.status} · autonomy {command.autonomyLevel} · {command.createdAt}
                </p>
                {command.plan && (
                  <>
                    <p style={{ color: "#333" }}>
                      <strong>Objective:</strong> {command.plan.objective} ({command.plan.status})
                    </p>
                    {command.plan.tasks.length === 0 ? null : (
                      <ul>
                        {command.plan.tasks.map((task) => (
                          <li key={task.id}>
                            {task.order}. {task.title} ({task.status})
                            {task.actions.length > 0 && (
                              <ul>
                                {task.actions.map((action) => (
                                  <li key={action.id}>
                                    tool <code>{action.tool}</code> — permission {action.permissionResult} (required{" "}
                                    {action.requiredAutonomy}, at autonomy {action.autonomyLevel}) — {action.status}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {command.auditLogs.length > 0 && (
                  <p style={{ color: "#777", fontSize: "0.85rem" }}>
                    audit: {command.auditLogs.map((a) => `${a.verb}(${a.entityType})`).join(" · ")}
                  </p>
                )}
              </div>
            ))
          )}
        </section>
      )}

      <p style={{ color: "#999", fontSize: "0.85rem" }}>
        Read-only foundation: this page renders recorded state only. Nothing here creates, mutates, or fabricates data.
      </p>
    </main>
  );
}