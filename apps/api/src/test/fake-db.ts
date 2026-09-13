import type { DbClient } from "../db/db-client";

export interface FakeRow {
  id: string;
  [key: string]: unknown;
}

export interface FakeDbResult {
  db: DbClient;
  rows: Record<string, FakeRow[]>;
}

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

  const delegate = (name: string) => ({
    create: async ({ data }: { data: Record<string, unknown> }): Promise<FakeRow> => {
      const row: FakeRow = { id: `${name}_${ensure(name).length + 1}`, ...withDefaults(name, data) };
      ensure(name).push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id?: string } }): Promise<FakeRow | null> =>
      ensure(name).find((r) => r.id === where.id) ?? null,
    findMany: async (): Promise<FakeRow[]> => ensure(name),
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