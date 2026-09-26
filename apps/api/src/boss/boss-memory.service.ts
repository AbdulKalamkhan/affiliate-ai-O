import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { Prisma } from "@ai-os/database";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { TOOL_DEFINITIONS, isKnownTool, isImplemented } from "./boss-tool-registry";
import type { BossToolName } from "./boss-tools";

/**
 * AI CEO memory + learning foundation (Phase-01A).
 *
 * HONESTY CONTRACT: a memory row is NOT evidence that the AI "learned".
 * A lesson is only stored when a decision has an OBSERVED outcome, and the
 * lesson text is generated from that comparison. Pending decisions never
 * produce lessons. `evidenceSummary` reports how many lessons are grounded in
 * real observed outcomes vs still awaiting evidence.
 */

export const MEMORY_KINDS = ["fact", "pattern", "lesson", "constraint"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface RememberInput {
  key: string;
  kind: MemoryKind;
  value: Prisma.InputJsonValue;
  weight?: number;
  confidence?: number;
  source?: string;
  tags?: string[];
}

export interface RecordOutcomeInput {
  decisionId: string;
  actual: string;
  success: boolean;
  lesson?: string;
  tags?: string[];
}

export interface LearningEvidence {
  decisions: number;
  decisionsWithOutcome: number;
  lessons: number;
  groundedLessons: number;
  pendingOutcomes: number;
  groundedRatio: number | null;
  status: "no_data" | "awaiting_outcomes" | "grounded";
  note: string;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

@Injectable()
export class BossMemoryService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  /** Upsert-by-key memory write. Deterministic and idempotent per key. */
  async remember(input: RememberInput) {
    if (!input.key || !input.key.trim()) {
      throw new BadRequestException("memory key is required");
    }
    if (!(MEMORY_KINDS as readonly string[]).includes(input.kind)) {
      throw new BadRequestException(`kind must be one of: ${MEMORY_KINDS.join(", ")}`);
    }
    const key = input.key.trim();
    const existing = await this.client.bossMemory.findMany({ where: { key }, take: 1 });
    const data = {
      kind: input.kind,
      value: input.value,
      ...(input.weight !== undefined ? { weight: clamp01(input.weight) } : {}),
      ...(input.confidence !== undefined ? { confidence: clamp01(input.confidence) } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      lastSeenAt: new Date(),
    };
    if (existing[0]) {
      return this.client.bossMemory.update({ where: { key }, data });
    }
    return this.client.bossMemory.create({ data: { key, ...data } });
  }

  async list(kind?: string) {
    if (kind && !(MEMORY_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`kind must be one of: ${MEMORY_KINDS.join(", ")}`);
    }
    return this.client.bossMemory.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { lastSeenAt: "desc" },
    });
  }

  /** Record a structured AI decision (proposal only — never mutates money). */
  async recordDecision(input: {
    commandId?: string | null;
    decision: string;
    rationale: string;
    factors?: Prisma.InputJsonValue;
    confidence?: number;
  }) {
    if (!input.decision?.trim()) throw new BadRequestException("decision is required");
    if (!input.rationale?.trim()) throw new BadRequestException("rationale is required");
    return this.client.bossDecision.create({
      data: {
        ...(input.commandId ? { commandId: input.commandId } : {}),
        decision: input.decision.trim(),
        rationale: input.rationale.trim(),
        ...(input.factors !== undefined ? { factors: input.factors } : {}),
        ...(input.confidence !== undefined ? { confidence: clamp01(input.confidence) } : {}),
        executed: false,
      },
    });
  }

  async listDecisions() {
    return this.client.bossDecision.findMany({ orderBy: { createdAt: "desc" } });
  }

  /**
   * Close the loop: attach an OBSERVED outcome to a decision and derive a
   * lesson. Rejects a second outcome for the same decision so a prediction can
   * never be silently rewritten.
   */
  async recordOutcome(input: RecordOutcomeInput) {
    if (!input.actual?.trim()) throw new BadRequestException("actual outcome is required");
    const decisions = await this.client.bossDecision.findMany({
      where: { id: input.decisionId },
      take: 1,
    });
    const decision = decisions[0];
    if (!decision) {
      throw new NotFoundException(`boss decision ${input.decisionId} not found`);
    }
    if (decision.outcome) {
      throw new ConflictException(
        `decision ${input.decisionId} already has an outcome — outcomes are immutable`,
      );
    }
    const prediction = typeof decision.decision === "string" ? decision.decision : "unknown";
    const actual = input.actual.trim();
    const lesson =
      input.lesson?.trim() ||
      `Predicted "${prediction}" → observed "${actual}" (${input.success ? "success" : "failure"}).`;

    await this.client.bossDecision.update({
      where: { id: input.decisionId },
      data: { outcome: actual, executed: true },
    });
    const created = await this.client.bossLesson.create({
      data: {
        decisionId: input.decisionId,
        ...(decision.commandId ? { commandId: decision.commandId as string } : {}),
        prediction,
        actual,
        success: input.success,
        lesson,
        ...(input.tags ? { tags: input.tags } : {}),
      },
    });
    await this.client.bossAuditLog.create({
      data: {
        ...(decision.commandId ? { commandId: decision.commandId as string } : {}),
        entityType: "lesson",
        entityId: created.id as string,
        verb: "outcome_recorded",
        actor: "owner",
        detail: { decisionId: input.decisionId, success: input.success },
      },
    });
    return created;
  }

  async listLessons(limit = 50) {
    return this.client.bossLesson.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Truthful learning-readiness summary. `groundedRatio` is null (not 0) when
   * there is no evidence yet, so the UI can say "Awaiting data" honestly.
   */
  async learningEvidence(): Promise<LearningEvidence> {
    const [decisions, lessons] = await Promise.all([
      this.client.bossDecision.findMany({ orderBy: { createdAt: "desc" } }),
      this.client.bossLesson.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    const withOutcome = decisions.filter((d) => Boolean(d.outcome));
    const grounded = lessons.filter((l) => l.success !== null && l.actual);
    const pending = decisions.length - withOutcome.length;
    const status: LearningEvidence["status"] =
      decisions.length === 0
        ? "no_data"
        : grounded.length === 0
          ? "awaiting_outcomes"
          : "grounded";
    return {
      decisions: decisions.length,
      decisionsWithOutcome: withOutcome.length,
      lessons: lessons.length,
      groundedLessons: grounded.length,
      pendingOutcomes: pending,
      groundedRatio: lessons.length === 0 ? null : Number((grounded.length / lessons.length).toFixed(2)),
      status,
      note:
        status === "no_data"
          ? "No AI decisions recorded yet."
          : status === "awaiting_outcomes"
            ? "Decisions exist but none has an observed outcome — no lesson can be derived yet."
            : "Lessons derived from observed decision outcomes.",
    };
  }

  /**
   * Recommendations are derived ONLY from grounded lessons. With no grounded
   * evidence the system returns an explicit "insufficient evidence" result
   * rather than an invented recommendation.
   */
  async recommendations() {
    const evidence = await this.learningEvidence();
    if (evidence.groundedLessons === 0) {
      return {
        status: "insufficient_evidence" as const,
        recommendations: [],
        reason:
          "No outcome-grounded lessons exist yet. AI_OS will not fabricate a recommendation.",
        groundedLessons: evidence.groundedLessons,
      };
    }
    const lessons = await this.client.bossLesson.findMany({
      where: { success: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      status: "grounded" as const,
      groundedLessons: evidence.groundedLessons,
      recommendations: lessons.map((l) => ({
        lesson: l.lesson,
        actual: l.actual,
        prediction: l.prediction,
        observedAt: l.createdAt,
      })),
    };
  }

  /** Capability snapshot used by the Command Center (no secrets, no claims). */
  async capability() {
    const tools = Object.values(TOOL_DEFINITIONS);
    return {
      executor: "implemented",
      approvals: "implemented",
      permissions: "autonomy-level + owner-approval policy",
      llmProvider: "not_connected",
      tools: {
        total: tools.length,
        implemented: tools.filter((t) => t.implementation === "implemented").length,
        notImplemented: tools.filter((t) => t.implementation === "not_implemented").map((t) => t.name),
      },
      externalSideEffectTools: tools
        .filter((t) => t.sideEffect === "external")
        .map((t) => t.name as BossToolName),
      knownToolGuard: isKnownTool("analytics.read") && isImplemented("analytics.read"),
    };
  }
}
