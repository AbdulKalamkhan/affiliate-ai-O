// Simple correlation ID propagation utilities (advisory, no secrets).
// A correlationId identifies a logical command/request chain and is preserved
// across transitions. It is generated once at the boundary and never exposed
// to clients; logs/audit may attach it without leaking payloads.

import { randomUUID } from "crypto";

export const CORRELATION_ID_HEADER = "x-correlation-id";

export function generateCorrelationId(): string {
  return randomUUID();
}

export function normalizeCorrelationId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (trimmed.length === 0) return null;
  // 200 chars is more than enough for a UUID/ulid and prevents log stuffing.
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}