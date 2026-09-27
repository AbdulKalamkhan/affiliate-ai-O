import type { DbClient, DbTransactionClient } from "../db/db-client";

export interface FakeRow {
  id: string;
  [key: string]: unknown;
}

export interface FakeDbResult {
  db: DbClient;
  rows: Record<string, FakeRow[]>;
  /** Transaction outcomes observed by the fake client. */
  transactions: { committed: number; rolledBack: number };
  /** Force the next $transaction to reject, to prove a money path is atomic. */
  failNextTransaction(error?: Error): void;
}

interface FindOptions {
  where?: Record<string, unknown>;
  orderBy?: { [field: string]: "asc" | "desc" };
  take?: number;
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

interface AggregateOptions {
  where?: Record<string, unknown>;
  _sum?: Record<string, unknown>;
}

/** Every table the fake Prisma client exposes — used to pre-create buckets. */
const DELEGATE_NAMES = {
  opportunity: 1,
  opportunityEvidence: 1,
  affiliateLink: 1,
  affiliateLinkClick: 1,
  contentAsset: 1,
  revenueEvent: 1,
  profitRecord: 1,
  bossCommand: 1,
  bossPlan: 1,
  bossTask: 1,
  bossAction: 1,
  bossAuditLog: 1,
  bossApproval: 1,
  bossToolCall: 1,
  bossDecision: 1,
  bossMemory: 1,
  bossLesson: 1,
  sellerAccount: 1,
  sellerPermission: 1,
  product: 1,
  productVariant: 1,
  sellerListing: 1,
  sellerListingVersion: 1,
  sellerInventory: 1,
  sellerOrder: 1,
  sellerOrderItem: 1,
  sellerReturn: 1,
  sellerSettlement: 1,
  publishApproval: 1,
  automationJob: 1,
  automationAttempt: 1,
} as const;

/**
 * Composite unique constraints the fake enforces. Without these the fake
 * silently accepted duplicate `(handler, idempotencyKey)` rows that real
 * Postgres rejects with P2002, so a replay-key collision only surfaced in a live
 * database — exactly the class of bug the unit suite must catch.
 */
const UNIQUE_CONSTRAINTS: Record<string, string[][]> = {
  automationJob: [["handler", "idempotencyKey"]],
};

class FakeUniqueConstraintError extends Error {
  constructor(table: string, fields: string[]) {
    super(`Unique constraint failed on the fields: (${fields.map((f) => `"${f}"`).join(",")}) [${table}]`);
    this.name = "PrismaClientKnownRequestError";
  }
}

const matches = (row: FakeRow, where?: Record<string, unknown>): boolean => {  if (!where) return true;
  return Object.entries(where).every(([key, value]) => rowMatches(row, key, value));
};

/**
 * Supports equality plus the scalar comparators Prisma actually uses for date and
 * numeric filters (`lte`, `lt`, `gte`, `gt`). Without this the fake silently
 * ignored `runAt: { lte: now }` and a claim-queue spec would pass for the wrong
 * reason.
 */
const rowMatches = (row: FakeRow, key: string, value: unknown): boolean => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (value instanceof Date) return toTime(row[key]) === value.getTime();
    return row[key] === value;
  }
  const actual = toTime(row[key]);
  const cmp = value as { lte?: unknown; lt?: unknown; gte?: unknown; gt?: unknown; not?: unknown };
  if (cmp.not !== undefined) return row[key] !== cmp.not;
  if (cmp.lte !== undefined) return actual <= toTime(cmp.lte);
  if (cmp.lt !== undefined) return actual < toTime(cmp.lt);
  if (cmp.gte !== undefined) return actual >= toTime(cmp.gte);
  if (cmp.gt !== undefined) return actual > toTime(cmp.gt);
  return row[key] === value;
};

const toTime = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  if (value !== null && typeof value === "object" && "getTime" in (value as { getTime: () => number })) {
    return (value as { getTime: () => number }).getTime();
  }
  return Number(value);
};

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object" && "toNumber" in (value as { toNumber?: unknown })) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
};

export function makeFakeDb(): FakeDbResult {
  const rows: Record<string, FakeRow[]> = {};
  const ensure = (name: string): FakeRow[] => (rows[name] ??= []);
  // Monotonic clock so back-to-back creates get strictly increasing createdAt —
  // mirrors real Prisma inserts hitting separate transactions (at least 1ms apart)
  // and keeps orderBy createdAt assertions deterministic instead of same-ms flaky.
  let clock = 0;
  const nextCreatedAt = (): Date => {
    clock = Math.max(clock + 1, Date.now());
    return new Date(clock);
  };

  const DEFAULTS: Record<string, Record<string, unknown>> = {
    contentAsset: { published: false, disclosureAdded: false },
    // Mirrors the Prisma schema defaults so a spec that creates a job directly
    // sees the same state machine the real database enforces.
    automationJob: {
      status: "queued",
      queue: "default",
      attemptCount: 0,
      maxAttempts: 3,
      replayCount: 0,
    },
  };

  const withDefaults = (name: string, data: Record<string, unknown>): Record<string, unknown> => ({
    ...(DEFAULTS[name] ?? {}),
    ...data,
  });

  /**
   * Enforce the table's declared composite unique constraints. `excludeId`
   * excludes the row being updated so a no-op update does not self-collide.
   * A `null` member of a unique tuple is treated as distinct, matching SQL:
   * multiple rows may have a NULL idempotency key.
   */
  const assertUnique = (name: string, candidate: FakeRow, excludeId: string | null) => {
    for (const fields of UNIQUE_CONSTRAINTS[name] ?? []) {
      const values = fields.map((f) => candidate[f]);
      if (values.some((v) => v === null || v === undefined)) continue;
      const clash = ensure(name).find(
        (r) => r.id !== excludeId && fields.every((f, i) => r[f] === values[i]),
      );
      if (clash) throw new FakeUniqueConstraintError(name, fields);
    }
  };

  const withCount = (row: FakeRow): FakeRow => {
    const clickCount = ensure("affiliateLinkClick").filter((c) => c.linkId === row.id).length;
    return { ...row, _count: { clicks: clickCount } };
  };

  const applyIncludes = (name: string, rowsList: FakeRow[], include?: Record<string, unknown>): FakeRow[] => {
    if (!include) return rowsList;
    if (name === "affiliateLink") {
      return rowsList.map(withCount);
    }
    if (name === "contentAsset" && include.link) {
      return rowsList.map((row) => {
        const link = ensure("affiliateLink").find((l) => l.id === row.linkId);
        return { ...row, link: link ? withCount(link) : (undefined as unknown) };
      });
    }
    if (name === "revenueEvent" && include.profitRecord) {
      return rowsList.map((row) => {
        const profit = ensure("profitRecord").find((p) => p.revenueEventId === row.id);
        return { ...row, profitRecord: profit ?? null };
      });
    }
    if (name === "bossPlan") {
      return rowsList.map((row) => {
        const withActions = (task: FakeRow) => ({
          ...task,
          actions: ensure("bossAction").filter((a) => a.taskId === task.id),
        });
        return { ...row, tasks: ensure("bossTask").filter((t) => t.planId === row.id).map(withActions) };
      });
    }
    if (name === "bossTask") {
      return rowsList.map((row) => ({
        ...row,
        actions: ensure("bossAction").filter((a) => a.taskId === row.id),
      }));
    }
    if (name === "bossAction") {
      return rowsList.map((row) => ({
        ...row,
        approvals: ensure("bossApproval").filter((a) => a.actionId === row.id),
        toolCalls: ensure("bossToolCall").filter((t) => t.actionId === row.id),
      }));
    }
    if (name === "bossApproval") {
      return rowsList.map((row) => {
        const action = ensure("bossAction").find((a) => a.id === row.actionId);
        if (!action) return row;
        const task = ensure("bossTask").find((t) => t.id === action.taskId);
        const plan = task ? ensure("bossPlan").find((p) => p.id === task.planId) : undefined;
        const withActions = (t: FakeRow) => ({
          ...t,
          actions: ensure("bossAction").filter((a) => a.taskId === t.id),
        });
        return {
          ...row,
          action: {
            ...action,
            task: task ? { ...task, plan: plan ? { ...plan, tasks: ensure("bossTask").filter((t) => t.planId === plan.id).map(withActions) } : undefined } : undefined,
          },
        };
      });
    }
    if (name === "bossCommand") {
      return rowsList.map((row) => {
        const plan = ensure("bossPlan").find((p) => p.commandId === row.id);
        const withActions = (task: FakeRow) => ({
          ...task,
          actions: ensure("bossAction").filter((a) => a.taskId === task.id),
        });
        const state: FakeRow = { ...row };
        if (include.plan) {
          state.plan = plan
            ? { ...plan, tasks: ensure("bossTask").filter((t) => t.planId === plan.id).map(withActions) }
            : null;
        }
        if (include.auditLogs) {
          state.auditLogs = ensure("bossAuditLog")
            .filter((a) => a.commandId === row.id)
            .sort(
              (a, b) =>
                new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime(),
            );
        }
        return state;
      });
    }
    return rowsList;
  };

  const delegate = (name: string) => ({
    create: async ({ data }: { data: Record<string, unknown> }): Promise<FakeRow> => {
      const row: FakeRow = { id: `${name}_${ensure(name).length + 1}`, ...withDefaults(name, data) };
      if (!("createdAt" in row)) row.createdAt = nextCreatedAt();
      if (!("capturedAt" in row)) row.capturedAt = nextCreatedAt();
      if (!("grantedAt" in row)) row.grantedAt = nextCreatedAt();
      if (!("updatedAt" in row)) row.updatedAt = nextCreatedAt();
      if (!("runAt" in row)) row.runAt = nextCreatedAt();
      // Nullable columns must read back as `null` (what Prisma returns), not
      // `undefined` — a spec asserting `toBeNull()` is a real contract check.
      if (!("startedAt" in row)) row.startedAt = null;
      if (!("finishedAt" in row)) row.finishedAt = null;
      if (!("lockedAt" in row)) row.lockedAt = null;
      if (!("lockedBy" in row)) row.lockedBy = null;
      if (!("lastError" in row)) row.lastError = null;
      if (!("output" in row)) row.output = null;
      if (!("idempotencyKey" in row)) row.idempotencyKey = null;
      assertUnique(name, row, null);
      ensure(name).push(row);
      return row;
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
    }): Promise<FakeRow | null> => {
      const row = ensure(name).find((r) => matches(r, where)) ?? null;
      if (!row) return null;
      return (applyIncludes(name, [row], include) as FakeRow[])[0] ?? row;
    },
    findMany: async (options: FindOptions = {}): Promise<FakeRow[]> => {
      let result = ensure(name).filter((r) => matches(r, options.where));
      if (options.orderBy) {
        const [field, dir] = Object.entries(options.orderBy)[0];
        result = [...result].sort((a, b) => {
          const av = a[field] as string | number | Date;
          const bv = b[field] as string | number | Date;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === "desc" ? -cmp : cmp;
        });
      }
      if (name === "affiliateLink" && options.select?._count) {
        result = result.map(withCount);
      }
      result = applyIncludes(name, result, options.include);
      if (typeof options.take === "number") result = result.slice(0, options.take);
      if (options.select) {
        const keys = Object.keys(options.select);
        result = result.map((r) =>
          Object.fromEntries(keys.filter((k) => k in r).map((k) => [k, r[k]])),
        ) as FakeRow[];
      }
      return result;
    },
    count: async ({ where }: { where?: Record<string, unknown> } = {}): Promise<number> =>
      ensure(name).filter((r) => matches(r, where)).length,
    aggregate: async ({ where, _sum }: AggregateOptions = {}): Promise<Record<string, unknown>> => {
      const list = ensure(name).filter((r) => matches(r, where));
      const sums: Record<string, number> = {};
      for (const field of Object.keys(_sum ?? {})) {
        sums[field] = list.reduce((acc, r) => acc + toNumber(r[field]), 0);
      }
      return { _sum: sums };
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<FakeRow | null> => {
      const list = ensure(name);
      // Matches real Prisma: `where` may address any unique field (id, key, ...).
      const index = list.findIndex((r) => matches(r, where));
      if (index === -1) return null;
      // Validate BEFORE writing, and roll back on violation, so a failed update
      // never leaves a half-applied row behind (real Prisma rejects the whole
      // statement).
      const merged = { ...list[index], ...data } as FakeRow;
      const previous = list[index] as FakeRow;
      list[index] = merged;
      try {
        assertUnique(name, merged, previous.id as string);
      } catch (error) {
        list[index] = previous;
        throw error;
      }
      return list[index];
    },
    delete: async ({ where }: { where: Record<string, unknown> }): Promise<FakeRow | null> => {
      const list = ensure(name);
      const index = list.findIndex((r) => matches(r, where));
      if (index === -1) return null;
      const [removed] = list.splice(index, 1);
      return removed;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<FakeRow> => {
      const list = ensure(name);
      const index = list.findIndex((r) => matches(r, where));
      if (index === -1) {
        const row: FakeRow = {
          id: `${name}_${list.length + 1}`,
          ...withDefaults(name, { ...where, ...create }),
        };
        if (!("createdAt" in row)) row.createdAt = nextCreatedAt();
        if (!("capturedAt" in row)) row.capturedAt = nextCreatedAt();
        list.push(row);
        return row;
      }
      list[index] = { ...list[index], ...update };
      return list[index];
    },
  });

  // Transaction support: runs the callback against the same in-memory tables and
  // records the outcome, so specs can assert that a money path is atomic.
  const transactions: { committed: number; rolledBack: number } = { committed: 0, rolledBack: 0 };
  let failNextTransaction: Error | null = null;

  const db = {
    opportunity: delegate("opportunity"),
    opportunityEvidence: delegate("opportunityEvidence"),
    affiliateLink: delegate("affiliateLink"),
    affiliateLinkClick: delegate("affiliateLinkClick"),
    contentAsset: delegate("contentAsset"),
    revenueEvent: delegate("revenueEvent"),
    profitRecord: delegate("profitRecord"),
    bossCommand: delegate("bossCommand"),
    bossPlan: delegate("bossPlan"),
    bossTask: delegate("bossTask"),
    bossAction: delegate("bossAction"),
    bossAuditLog: delegate("bossAuditLog"),
    bossApproval: delegate("bossApproval"),
    bossToolCall: delegate("bossToolCall"),
    bossDecision: delegate("bossDecision"),
    bossMemory: delegate("bossMemory"),
    bossLesson: delegate("bossLesson"),
    sellerAccount: delegate("sellerAccount"),
    sellerPermission: delegate("sellerPermission"),
    product: delegate("product"),
    productVariant: delegate("productVariant"),
    sellerListing: delegate("sellerListing"),
    sellerListingVersion: delegate("sellerListingVersion"),
    sellerInventory: delegate("sellerInventory"),
    sellerOrder: delegate("sellerOrder"),
    sellerOrderItem: delegate("sellerOrderItem"),
    sellerReturn: delegate("sellerReturn"),
    sellerSettlement: delegate("sellerSettlement"),
    publishApproval: delegate("publishApproval"),
    automationJob: delegate("automationJob"),
    automationAttempt: delegate("automationAttempt"),
    $transaction: async <T,>(fn: (tx: DbTransactionClient) => Promise<T>): Promise<T> => {
      const forced = failNextTransaction;
      failNextTransaction = null;
      if (forced) {
        transactions.rolledBack += 1;
        throw forced;
      }
      const result = await fn(db as unknown as DbTransactionClient);
      transactions.committed += 1;
      return result;
    },
  } as unknown as DbClient;

  // Pre-create every table bucket so specs can assert `rows.x` lengths without
  // a prior write touching that table.
  for (const name of Object.keys(DELEGATE_NAMES)) ensure(name);

  return {
    db,
    rows,
    transactions,
    failNextTransaction(error = new Error("transaction failed")) {
      failNextTransaction = error;
    },
  };
}