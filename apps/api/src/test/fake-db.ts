import type { DbClient, DbTransactionClient } from "../db/db-client";

/**
 * Mirror of Prisma's "record not found" failure.
 *
 * Real Prisma 6 THROWS P2025 when an `update`/`delete` filter matches no row. The
 * fake previously returned `null` instead, which made every compare-and-swap
 * guard in the automation queue look exercised while being unreachable in
 * production ? a lost CAS race aborted the whole claim batch instead of skipping
 * one job. Production and test now fail the same way.
 */
class FakeRecordNotFoundError extends Error {
  readonly code = "P2025";
  constructor(model: string) {
    super(
      `\nInvalid \`prisma.${model}.update()\` invocation: An operation failed because it depends on one or more records that were required but not found. RecordNotFoundError: No ${model} record was found for a conditional update.`,
    );
    this.name = "PrismaClientKnownRequestError";
  }
}

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
  /** Prisma's P2025 error class, so specs can assert the CAS path realistically. */
  RecordNotFound: new (model: string) => Error;
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

/** Every table the fake Prisma client exposes ? used to pre-create buckets. */
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
  sellerSettlementLine: 1,
  publishApproval: 1,
  automationJob: 1,
  automationAttempt: 1,
  aiInvocation: 1,
} as const;

/**
 * Composite unique constraints the fake enforces. Without these the fake
 * silently accepted duplicate `(handler, idempotencyKey)` rows that real
 * Postgres rejects with P2002, so a replay-key collision only surfaced in a live
 * database ? exactly the class of bug the unit suite must catch.
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

/**
 * Child table -> [relation name, parent table, foreign key].
 *
 * Needed because a Prisma filter may traverse a relation, e.g.
 * `sellerSettlementLine.findMany({ where: { settlement: { createdAt: {...} } } })`.
 * Without this the fake would compare a plain object against a non-existent
 * column, match NOTHING, and a spec asserting "COGS is a real measurement"
 * would pass while the query was silently returning nothing.
 */
const RELATIONS: Record<string, { field: string; parent: string; fk: string }> = {
  sellerSettlementLine: { field: "settlement", parent: "sellerSettlement", fk: "settlementId" },
};

const matches = (
  row: FakeRow,
  where: Record<string, unknown> | undefined,
  table: string | undefined,
  get: (name: string) => FakeRow[],
): boolean => {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    // A relation filter resolves the parent row and applies the filter to it.
    const relation = table ? RELATIONS[table] : undefined;
    if (relation && key === relation.field) {
      if (value === null) return row[relation.fk] === null;
      if (typeof value !== "object" || Array.isArray(value)) return false;
      const parentRow = get(relation.parent).find((p) => p.id === row[relation.fk]);
      if (!parentRow) return false;
      return matches(parentRow, value as Record<string, unknown>, relation.parent, get);
    }
    return rowMatches(row, key, value);
  });
};

/**
 * Supports equality plus the scalar comparators Prisma actually uses for date and
 * numeric filters (`lte`, `lt`, `gte`, `gt`). Without this the fake silently
 * ignored `runAt: { lte: now }` and a claim-queue spec would pass for the wrong
 * reason.
 *
 * Every supplied comparator must hold (AND), matching Prisma. Returning on the
 * FIRST one found would make a `{ gte, lt }` range silently ignore its upper
 * bound, so an analytics window spec would pass while testing nothing.
 */
const rowMatches = (row: FakeRow, key: string, value: unknown): boolean => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (value instanceof Date) return toTime(row[key]) === value.getTime();
    return row[key] === value;
  }
  const actual = toTime(row[key]);
  const cmp = value as { lte?: unknown; lt?: unknown; gte?: unknown; gt?: unknown; not?: unknown };
  if (cmp.not !== undefined && row[key] === cmp.not) return false;
  if (cmp.lte !== undefined && !(actual <= toTime(cmp.lte))) return false;
  if (cmp.lt !== undefined && !(actual < toTime(cmp.lt))) return false;
  if (cmp.gte !== undefined && !(actual >= toTime(cmp.gte))) return false;
  if (cmp.gt !== undefined && !(actual > toTime(cmp.gt))) return false;
  if (
    cmp.lte === undefined &&
    cmp.lt === undefined &&
    cmp.gte === undefined &&
    cmp.gt === undefined &&
    cmp.not === undefined
  ) {
    return row[key] === value;
  }
  return true;
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
  // Monotonic clock so back-to-back creates get strictly increasing createdAt ?
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
    // Mirrors the AI boundary schema: a missing price is NULL (UNKNOWN), never 0.
    aiInvocation: { costState: "unknown_usage", verified: false },
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
    if (name === "sellerSettlement" && include.lines) {
      const spec = (include.lines ?? {}) as { orderBy?: Record<string, "asc" | "desc"> };
      const orderBy = spec.orderBy;
      return rowsList.map((row) => {
        const lines = ensure("sellerSettlementLine").filter((l) => l.settlementId === row.id);
        // Honour the nested orderBy, or a spec asserting the line order would
        // pass without the fake having sorted anything.
        const [field, dir] = Object.entries(orderBy ?? {})[0] ?? [];
        if (field) {
          lines.sort((a, b) => {
            const av = String(a[field] ?? "");
            const bv = String(b[field] ?? "");
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return dir === "desc" ? -cmp : cmp;
          });
        }
        return { ...row, lines };
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
      // Event tables carry `@default(now())` on their occurrence column. Without
      // it a row created without an explicit timestamp would be left `undefined`,
      // and every date-range filter would silently drop it ? making a
      // window-scoped analytics spec pass while measuring nothing.
      if (!("occurredAt" in row)) row.occurredAt = nextCreatedAt();
      if (!("recordedAt" in row)) row.recordedAt = nextCreatedAt();
      if (!("orderedAt" in row)) row.orderedAt = nextCreatedAt();
      // Nullable columns must read back as `null` (what Prisma returns), not
      // `undefined` ? a spec asserting `toBeNull()` is a real contract check.
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
      const row = ensure(name).find((r) => matches(r, where, name, ensure)) ?? null;
      if (!row) return null;
      return (applyIncludes(name, [row], include) as FakeRow[])[0] ?? row;
    },
    findMany: async (options: FindOptions = {}): Promise<FakeRow[]> => {
      let result = ensure(name).filter((r) => matches(r, options.where, name, ensure));
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
    findFirst: async (options: FindOptions = {}): Promise<FakeRow | null> => {
      // Real Prisma applies `orderBy` BEFORE `take`; the first matching row is
      // therefore the first SORTED row, not merely the first inserted. Getting
      // this backwards would make an idempotency lookup return the wrong record.
      const found = await delegate(name).findMany({ ...options, take: 1 });
      return found[0] ?? null;
    },
    count: async ({ where }: { where?: Record<string, unknown> } = {}): Promise<number> =>
      ensure(name).filter((r) => matches(r, where, name, ensure)).length,
    groupBy: async ({
      by,
      where,
      _count,
    }: {
      by: string[];
      where?: Record<string, unknown>;
      _count?: { _all?: boolean };
    }): Promise<unknown[]> => {
      const list = ensure(name).filter((r) => matches(r, where, name, ensure));
      const groups = new Map<string, FakeRow[]>();
      for (const row of list) {
        const key = by.map((field) => String(row[field] ?? "")).join("\u0000");
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      return [...groups.entries()].map(([key, rows]) => {
        const group: Record<string, unknown> = {};
        by.forEach((field, i) => {
          group[field] = key.split("\u0000")[i];
        });
        if (_count?._all) group._count = { _all: rows.length };
        return group;
      });
    },
    aggregate: async ({ where, _sum }: AggregateOptions = {}): Promise<Record<string, unknown>> => {
      const list = ensure(name).filter((r) => matches(r, where, name, ensure));
      const sums: Record<string, number | null> = {};
      for (const field of Object.keys(_sum ?? {})) {
        // Real Prisma returns NULL for `SUM` over ZERO rows, not 0. Seeding the
        // reduce at 0 made the fake invent a measurement of zero for an empty
        // set, which is exactly the "UNKNOWN became 0" defect this codebase
        // exists to prevent ? and it hid it inside the test double.
        sums[field] = list.length === 0 ? null : list.reduce((acc, r) => acc + toNumber(r[field]), 0);
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
      // Matches real Prisma: `where` may address any unique field (id, key, ...),
      // and a filter that matches NO row raises P2025 rather than returning null.
      const index = list.findIndex((r) => matches(r, where, name, ensure));
      if (index === -1) throw new FakeRecordNotFoundError(name);
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
      const index = list.findIndex((r) => matches(r, where, name, ensure));
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
      const index = list.findIndex((r) => matches(r, where, name, ensure));
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
    sellerSettlementLine: delegate("sellerSettlementLine"),
    publishApproval: delegate("publishApproval"),
    automationJob: delegate("automationJob"),
    automationAttempt: delegate("automationAttempt"),
    aiInvocation: delegate("aiInvocation"),
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
    RecordNotFound: FakeRecordNotFoundError,
  };
}