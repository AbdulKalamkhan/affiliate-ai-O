import { Inject, Injectable } from "@nestjs/common";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";

/**
 * NARROW, READ-ONLY memory reader for plan-time advisories.
 *
 * SCOPE (deliberately limited): plan generation may ASK what has failed before.
 * It may not lower autonomy, tighten a permission, block a command, or write.
 * Memory is advisory in this increment — see `buildMemoryCautions`.
 *
 * `MemoryFailure` intentionally carries NO free text and NO copy of the stored
 * `value`. Only identity (id/key), the tool it relates to, and a timestamp
 * cross this boundary, so a caution cannot leak a credential, token or payload
 * that happened to be recorded inside a memory row.
 */
export const BOSS_MEMORY_READER = Symbol("AI_OS_BOSS_MEMORY_READER");

/** Hard scan ceiling, independent of the caller's limit. */
export const MEMORY_FAILURE_SCAN_LIMIT = 100;
/** Default and maximum number of failures returned to plan generation. */
export const MEMORY_FAILURE_DEFAULT_LIMIT = 5;
export const MEMORY_FAILURE_MAX_LIMIT = 20;

export interface MemoryFailure {
  /** Id of the BossMemory row this came from, so every caution is traceable. */
  memoryId: string;
  /** Human-readable key of the BossMemory row. */
  memoryKey: string;
  /** Tool the recorded failure relates to, or null when not tool-specific. */
  tool: string | null;
  observedAt: Date;
}

export interface MemoryFailureQuery {
  commandType?: string;
  toolName?: string;
  context?: string;
  limit?: number;
}

export interface BossMemoryReader {
  getRelevantFailures(input?: MemoryFailureQuery): Promise<MemoryFailure[]>;
}

/**
 * A failure is only recognised when it was EXPLICITLY recorded as one:
 * `kind = "lesson"` with `value.success === false`. An unrecorded, ambiguous or
 * non-failure memory row is never promoted into a caution, so planning cannot
 * invent lessons.
 */
const MEMORY_FAILURE_KIND = "lesson";

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const isRecordedFailure = (row: { kind?: string | null; value?: unknown }): boolean =>
  row.kind === MEMORY_FAILURE_KIND && asRecord(row.value).success === false;

/** Tool attribution: explicit `tool`/`toolName` in the value, else a `tool:` tag. */
const toolOf = (row: { value?: unknown; tags?: unknown }): string | null => {
  const record = asRecord(row.value);
  const explicit = record.tool ?? record.toolName;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const tagged = asStringList(row.tags).find((tag) => tag.startsWith("tool:"));
  return tagged ? tagged.slice("tool:".length).trim() || null : null;
};

const clampLimit = (limit?: number): number => {
  if (limit === undefined || !Number.isFinite(limit)) return MEMORY_FAILURE_DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.trunc(limit), MEMORY_FAILURE_MAX_LIMIT));
};

/**
 * Read-only, deterministic, bounded. Ordering is `lastSeenAt` descending with
 * `memoryId` ascending as the tie-break, so equal timestamps cannot produce a
 * different order between runs.
 */
@Injectable()
export class DbBossMemoryReader implements BossMemoryReader {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  async getRelevantFailures(input: MemoryFailureQuery = {}): Promise<MemoryFailure[]> {
    const limit = clampLimit(input.limit);
    const needles = [input.commandType, input.context]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    const rows = await this.client.bossMemory.findMany({
      where: { kind: MEMORY_FAILURE_KIND },
      orderBy: { lastSeenAt: "desc" },
      take: MEMORY_FAILURE_SCAN_LIMIT,
    });

    return rows
      .filter(isRecordedFailure)
      .filter((row) => {
        const tool = toolOf(row);
        const tags = asStringList(row.tags);
        const toolMatches = input.toolName ? tool === input.toolName : false;
        const contextMatches = needles.length > 0 && needles.some((needle) => tags.includes(needle));
        // A tool-scoped query requires a tool or context match. A contextless,
        // toolless query means "any recorded failure", which stays bounded.
        if (input.toolName) return toolMatches || contextMatches;
        return contextMatches || needles.length === 0;
      })
      .sort((a, b) => {
        const at = a.lastSeenAt instanceof Date ? a.lastSeenAt.getTime() : 0;
        const bt = b.lastSeenAt instanceof Date ? b.lastSeenAt.getTime() : 0;
        if (at !== bt) return bt - at;
        return String(a.id).localeCompare(String(b.id));
      })
      .slice(0, limit)
      .map((row) => ({
        memoryId: String(row.id),
        memoryKey: String(row.key),
        tool: toolOf(row),
        observedAt: row.lastSeenAt instanceof Date ? row.lastSeenAt : new Date(0),
      }));
  }
}