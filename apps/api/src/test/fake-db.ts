import type { DbClient } from "../db/db-client";

export interface FakeRow {
  id: string;
  [key: string]: unknown;
}

export interface FakeDbResult {
  db: DbClient;
  rows: Record<string, FakeRow[]>;
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

const matches = (row: FakeRow, where?: Record<string, unknown>): boolean => {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => row[key] === value);
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

  const DEFAULTS: Record<string, Record<string, unknown>> = {
    contentAsset: { published: false, disclosureAdded: false },
  };

  const withDefaults = (name: string, data: Record<string, unknown>): Record<string, unknown> => ({
    ...(DEFAULTS[name] ?? {}),
    ...data,
  });

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
    return rowsList;
  };

  const delegate = (name: string) => ({
    create: async ({ data }: { data: Record<string, unknown> }): Promise<FakeRow> => {
      const row: FakeRow = { id: `${name}_${ensure(name).length + 1}`, ...withDefaults(name, data) };
      if (!("createdAt" in row)) row.createdAt = new Date();
      ensure(name).push(row);
      return row;
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: { id?: string };
      include?: Record<string, unknown>;
    }): Promise<FakeRow | null> => {
      const row = ensure(name).find((r) => r.id === where.id) ?? null;
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
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<FakeRow | null> => {
      const list = ensure(name);
      const index = list.findIndex((r) => r.id === where.id);
      if (index === -1) return null;
      list[index] = { ...list[index], ...data };
      return list[index];
    },
    delete: async ({ where }: { where: { id: string } }): Promise<FakeRow | null> => {
      const list = ensure(name);
      const index = list.findIndex((r) => r.id === where.id);
      if (index === -1) return null;
      const [removed] = list.splice(index, 1);
      return removed;
    },
  });

  const db = {
    opportunity: delegate("opportunity"),
    affiliateLink: delegate("affiliateLink"),
    affiliateLinkClick: delegate("affiliateLinkClick"),
    contentAsset: delegate("contentAsset"),
    revenueEvent: delegate("revenueEvent"),
    profitRecord: delegate("profitRecord"),
  } as unknown as DbClient;

  return { db, rows };
}