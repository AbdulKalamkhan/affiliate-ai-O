import { buildMemoryCautions, MEMORY_CAUTION_LIMIT } from "./boss-memory-cautions";
import { DbBossMemoryReader, MEMORY_FAILURE_MAX_LIMIT } from "./boss-memory-reader";
import { makeFakeDb } from "../test/fake-db";
import type { MemoryFailure } from "./boss-memory-reader";

const at = (minutesAgo: number) => new Date("2026-09-28T12:00:00.000Z").getTime() - minutesAgo * 60_000;

const failure = (overrides: Partial<MemoryFailure> & { memoryId: string }): MemoryFailure => ({
  memoryKey: overrides.memoryId,
  tool: null,
  observedAt: new Date(at(0)),
  ...overrides,
});

describe("plan-level memory cautions (advisory only)", () => {
  describe("buildMemoryCautions", () => {
    it("1. surfaces a relevant failure as a traceable, advisory caution", () => {
      const { cautions, suppressed } = buildMemoryCautions([
        failure({ memoryId: "mem-1", tool: "affiliate.publish" }),
      ]);
      expect(cautions).toHaveLength(1);
      expect(cautions[0].memoryId).toBe("mem-1");
      expect(cautions[0].tool).toBe("affiliate.publish");
      expect(cautions[0].message).toMatch(/Previous execution failure recorded for tool affiliate\.publish/);
      expect(cautions[0].message).toMatch(/verify input\/credential\/state assumptions/);
      expect(suppressed).toBe(0);
    });

    it("uses advisory wording and never a prohibition", () => {
      const { cautions } = buildMemoryCautions([failure({ memoryId: "mem-1", tool: "affiliate.publish" })]);
      const text = cautions[0].message.toLowerCase();
      expect(text).not.toMatch(/forbidden|blocked|denied|refuse|disallow|must not|never run/);
    });

    it("handles a failure with no tool attribution", () => {
      const { cautions } = buildMemoryCautions([failure({ memoryId: "mem-1" })]);
      expect(cautions[0].tool).toBeNull();
      expect(cautions[0].message).toMatch(/this workflow/);
    });

    it("2. ignores a duplicate failure for a tool already cautioned", () => {
      const { cautions, suppressed } = buildMemoryCautions([
        failure({ memoryId: "mem-1", tool: "affiliate.publish" }),
        failure({ memoryId: "mem-2", tool: "affiliate.publish" }),
      ]);
      expect(cautions).toHaveLength(1);
      expect(cautions[0].memoryId).toBe("mem-1");
      expect(suppressed).toBe(1);
    });

    it("3. produces zero cautions with no memory", () => {
      expect(buildMemoryCautions([]).cautions).toEqual([]);
    });

    it("4. bounds the result count and reports what was suppressed", () => {
      const failures = ["a", "b", "c", "d"].map((tool, index) =>
        failure({ memoryId: `mem-${index}`, tool }),
      );
      const { cautions, suppressed } = buildMemoryCautions(failures);
      expect(cautions).toHaveLength(MEMORY_CAUTION_LIMIT);
      expect(suppressed).toBe(failures.length - MEMORY_CAUTION_LIMIT);
    });

    it("never exceeds the hard bound even if a larger limit is requested", () => {
      const failures = Array.from({ length: 12 }, (_, index) =>
        failure({ memoryId: `mem-${index}`, tool: `tool.${index}` }),
      );
      expect(buildMemoryCautions(failures, 999).cautions).toHaveLength(MEMORY_CAUTION_LIMIT);
    });

    it("honours a smaller limit", () => {
      const failures = ["a", "b", "c"].map((tool, index) => failure({ memoryId: `mem-${index}`, tool }));
      expect(buildMemoryCautions(failures, 1).cautions).toHaveLength(1);
    });

    it("is deterministic for identical input regardless of limit", () => {
      const failures = ["a", "b", "c"].map((tool, index) => failure({ memoryId: `mem-${index}`, tool }));
      const first = buildMemoryCautions(failures).cautions;
      const second = buildMemoryCautions(failures).cautions;
      expect(second).toEqual(first);
    });

    it("carries no stored payload, so memory cannot leak a secret", () => {
      const { cautions } = buildMemoryCautions([failure({ memoryId: "mem-1", tool: "affiliate.publish" })]);
      expect(Object.keys(cautions[0]).sort()).toEqual(["memoryId", "message", "tool"]);
      expect(JSON.stringify(cautions[0])).not.toMatch(/token|secret|password|apiKey/i);
    });

    it("treats a negative limit as zero rather than unbounded", () => {
      const failures = ["a", "b"].map((tool, index) => failure({ memoryId: `mem-${index}`, tool }));
      expect(buildMemoryCautions(failures, -5).cautions).toHaveLength(0);
    });
  });

  describe("DbBossMemoryReader", () => {
    it("returns only rows explicitly recorded as failures", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      await fake.db.bossMemory.create({
        data: { key: "failed", kind: "lesson", value: { success: false, tool: "affiliate.publish" } },
      });
      await fake.db.bossMemory.create({
        data: { key: "succeeded", kind: "lesson", value: { success: true, tool: "affiliate.publish" } },
      });
      await fake.db.bossMemory.create({
        data: { key: "ambiguous", kind: "lesson", value: { tool: "affiliate.publish" } },
      });
      await fake.db.bossMemory.create({
        data: { key: "pattern", kind: "pattern", value: { success: false, tool: "affiliate.publish" } },
      });
      const rows = await reader.getRelevantFailures({ toolName: "affiliate.publish" });
      expect(rows.map((row) => row.memoryKey)).toEqual(["failed"]);
    });

    it("2. ignores a failure for an unrelated tool", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      await fake.db.bossMemory.create({
        data: { key: "publish-failed", kind: "lesson", value: { success: false, tool: "affiliate.publish" } },
      });
      await fake.db.bossMemory.create({
        data: { key: "revenue-failed", kind: "lesson", value: { success: false, tool: "revenue.reconcile" } },
      });
      const rows = await reader.getRelevantFailures({ toolName: "affiliate.publish" });
      expect(rows.map((row) => row.tool)).toEqual(["affiliate.publish"]);
    });

    it("ignores a contextless, toolless failure when a tool is queried", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      await fake.db.bossMemory.create({
        data: { key: "general", kind: "lesson", value: { success: false } },
      });
      expect(await reader.getRelevantFailures({ toolName: "affiliate.publish" })).toEqual([]);
    });

    it("matches a tool: tag when the value carries no tool", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      await fake.db.bossMemory.create({
        data: { key: "tagged", kind: "lesson", value: { success: false }, tags: ["tool:affiliate.publish"] },
      });
      const rows = await reader.getRelevantFailures({ toolName: "affiliate.publish" });
      expect(rows.map((row) => row.tool)).toEqual(["affiliate.publish"]);
    });

    it("matches by context tag", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      await fake.db.bossMemory.create({
        data: { key: "ctx-hit", kind: "lesson", value: { success: false }, tags: ["publishing"] },
      });
      await fake.db.bossMemory.create({
        data: { key: "ctx-miss", kind: "lesson", value: { success: false }, tags: ["pricing"] },
      });
      const rows = await reader.getRelevantFailures({ context: "publishing" });
      expect(rows.map((row) => row.memoryKey)).toEqual(["ctx-hit"]);
    });

    it("4. bounds the result count", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      for (let index = 0; index < 12; index += 1) {
        await fake.db.bossMemory.create({
          data: { key: `mem-${index}`, kind: "lesson", value: { success: false, tool: `tool.${index}` } },
        });
      }
      const rows = await reader.getRelevantFailures({ limit: 4 });
      expect(rows).toHaveLength(4);
    });

    it("caps a caller-supplied limit", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      for (let index = 0; index < 25; index += 1) {
        await fake.db.bossMemory.create({
          data: { key: `mem-${index}`, kind: "lesson", value: { success: false, tool: `tool.${index}` } },
        });
      }
      expect(await reader.getRelevantFailures({ limit: 9999 })).toHaveLength(MEMORY_FAILURE_MAX_LIMIT);
    });

    it("never returns stored payload fields", async () => {
      const fake = await makeFakeDb();
      const reader = new DbBossMemoryReader(fake.db);
      await fake.db.bossMemory.create({
        data: { key: "leaky", kind: "lesson", value: { success: false, tool: "affiliate.publish", detail: "sk-live-do-not-leak" } },
      });
      const rows = await reader.getRelevantFailures({ toolName: "affiliate.publish" });
      expect(JSON.stringify(rows)).not.toMatch(/sk-live-do-not-leak/);
      expect(Object.keys(rows[0]).sort()).toEqual(["memoryId", "memoryKey", "observedAt", "tool"]);
    });

    it("returns an empty array when there is no memory at all", async () => {
      const fake = await makeFakeDb();
      expect(await new DbBossMemoryReader(fake.db).getRelevantFailures()).toEqual([]);
    });

    it("7. does not write: the reader issues no create, update or delete", async () => {
      const fake = await makeFakeDb();
      await fake.db.bossMemory.create({
        data: { key: "read-only", kind: "lesson", value: { success: false, tool: "affiliate.publish" } },
      });
      const before = (await fake.db.bossMemory.findMany({})).length;
      await new DbBossMemoryReader(fake.db).getRelevantFailures({ toolName: "affiliate.publish" });
      expect((await fake.db.bossMemory.findMany({})).length).toBe(before);
    });
  });
});