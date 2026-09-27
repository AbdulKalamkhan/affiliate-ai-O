// Secret redaction for the AI boundary.
//
// A prompt is untrusted input that flows into a third-party system, an audit row
// and possibly a log line. Anything that looks like a credential must be removed
// BEFORE it leaves this process, not merely before it is written to a file.
//
// Design constraints:
//   1. Redaction is applied to BOTH directions (outbound prompt, inbound
//      response) and to every persisted copy (audit, invocation row).
//   2. Redaction is structural first (known env var values) and heuristic second
//      (known credential shapes) so an unregistered secret is still caught.
//   3. The output must be obviously redacted, and the PLACEHOLDER must not be
//      able to collide with real content.

export const REDACTED = "[REDACTED]";

/** Env var names whose VALUES are treated as secrets wherever they appear. */
const SECRET_ENV_NAMES = [
  "API_KEY",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "PA_API_ACCESS_KEY",
  "PA_API_SECRET_KEY",
  "PA_API_PARTNER_TAG",
  "SECOND_NETWORK_API_KEY",
  "N8N_WEBHOOK_SECRET",
  "N8N_WEBHOOK_URL",
  "RESEARCH_FEED_API_KEY",
  "AIOS_PROVIDER_API_KEY",
  "JWT_SECRET",
] as const;

type SecretPattern = {
  name: string;
  pattern: RegExp;
  /**
   * Capture groups holding LITERAL CONTEXT, split by which side of the
   * credential they sit on. Every other group is credential material and is
   * dropped. Being explicit matters: `replace` hands the callback
   * `(match, ...groups, offset, input)`, so guessing which group is context is
   * how a redactor emits the secret it was meant to hide — or splices the raw
   * input back into its own output.
   */
  before: number[];
  after: number[];
};

/**
 * Credential shapes that must be caught even when the value came from
 * somewhere we do not know about (a user pasted it into a prompt, a provider
 * echoed it back, a fixture hardcoded it).
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // Provider-prefixed keys: sk-..., sk-ant-..., AIza..., ghp_...
  // The whole match is the credential, so nothing is kept.
  { name: "openai-style", pattern: /\b(sk-[A-Za-z0-9_-]{16,})\b/g, before: [], after: [] },
  { name: "anthropic-style", pattern: /\b(sk-ant-[A-Za-z0-9_-]{16,})\b/g, before: [], after: [] },
  { name: "google-style", pattern: /\b(AIza[A-Za-z0-9_-]{20,})\b/g, before: [], after: [] },
  { name: "github-token", pattern: /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g, before: [], after: [] },
  // Authorization headers in any casing, including inside a pasted curl command.
  { name: "bearer-header", pattern: /\b(bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, before: [0], after: [] },
  { name: "basic-auth-header", pattern: /\b(basic\s+)[A-Za-z0-9+/]{12,}=*/gi, before: [0], after: [] },
  // Key=value / "key": "value" assignments whose name screams credential.
  {
    name: "credential-assignment",
    pattern:
      /((?:api[_-]?key|secret|password|passwd|token|credential|authorization|client[_-]?secret|access[_-]?key)\s*[=:]\s*["']?)([^\s"'&,;}]{8,})/gi,
    before: [0],
    after: [],
  },
  // Connection strings with inline credentials. The trailing `@` is kept after
  // the marker so the result still reads as a connection string.
  { name: "connection-string", pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+(@)/gi, before: [0], after: [1] },
];

/** Exact secret values registered from the environment, longest first. */
const registeredSecrets = (): string[] =>
  SECRET_ENV_NAMES.map((name) => process.env[name])
    .filter((value): value is string => typeof value === "string" && value.trim().length >= 8)
    // Longest first so a secret that contains another is masked as a whole.
    .sort((a, b) => b.length - a.length);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replace each pattern's credential with `[REDACTED]`, keeping only the literal
 * context that pattern declares.
 */
const applyPatterns = (text: string): string => {
  let output = text;
  for (const { pattern, before, after } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    const groupCount = new RegExp(`${pattern.source}|`).exec("")!.length - 1;
    output = output.replace(pattern, (_match: string, ...rest: unknown[]) => {
      const groups = rest.slice(0, groupCount) as (string | undefined)[];
      const keep = (indices: number[]): string => indices.map((index) => groups[index] ?? "").join("");
      return `${keep(before)}${REDACTED}${keep(after)}`;
    });
  }
  return output;
};

/**
 * Remove credential material from arbitrary text.
 *
 * Structural pass: any registered env secret value is replaced verbatim.
 * Heuristic pass: known credential shapes are replaced even if unregistered.
 */
export const redactSecrets = (text: string): string => {
  if (typeof text !== "string" || text.length === 0) return text;
  let output = text;

  for (const secret of registeredSecrets()) {
    output = output.replace(new RegExp(escapeRegExp(secret), "g"), REDACTED);
  }

  return applyPatterns(output);
};

/** Redact an arbitrary JSON-ish value for safe persistence. */
export const redactValue = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return REDACTED;
  if (typeof value === "string") return redactSecrets(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    // A key that is itself a secret NAME must never keep its value.
    if (SECRET_ENV_NAMES.includes(key as (typeof SECRET_ENV_NAMES)[number])) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactValue(entry, depth + 1);
  }
  return out;
};

/** True when redaction would change the text — used by tests and audit output. */
export const containsSecret = (text: string): boolean => redactSecrets(text) !== text;
