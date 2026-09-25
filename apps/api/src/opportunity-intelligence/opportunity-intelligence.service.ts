import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";

// Phase-02 — Evidence-backed opportunity intelligence (Affiliate-02/03).
// Deterministic, reproducible scoring: every recommendation is computed from
// recorded evidence rows (opportunity_evidence) using a versioned, explicit
// weight set. Evidence quality classes are persisted per claim
// (FACT | ESTIMATE | INFERENCE | PREDICTION | UNKNOWN). Nothing here forecasts,
// executes, or treats a trend as profit.

export const EVIDENCE_QUALITIES = ["FACT", "ESTIMATE", "INFERENCE", "PREDICTION", "UNKNOWN"] as const;
export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number];

// Quality → scoring reliability. FACT contributes fully; UNKNOWN contributes zero,
// so an opportunity backed only by guesses cannot rank on chatter.
export const QUALITY_WEIGHT: Record<EvidenceQuality, number> = {
  FACT: 1,
  ESTIMATE: 0.75,
  INFERENCE: 0.5,
  PREDICTION: 0.25,
  UNKNOWN: 0,
};

// Versioned canonical weight set (Affiliate-03). Positive factors add to the
// score, negative factors subtract. Weights are fixed at the version boundary so
// rankings are repeatable — changing a weight requires a new version.
export const SCORE_WEIGHTS_VERSION = 1;
export const SCORE_WEIGHTS = {
  demand: { weight: 15, sign: 1 },
  trend: { weight: 5, sign: 1 },
  productQuality: { weight: 15, sign: 1 },
  commission: { weight: 10, sign: 1 },
  conversionPotential: { weight: 10, sign: 1 },
  contentPotential: { weight: 10, sign: 1 },
  audienceFit: { weight: 10, sign: 1 },
  marketGap: { weight: 5, sign: 1 },
  seasonality: { weight: 5, sign: 1 },
  competition: { weight: -10, sign: -1 },
  risk: { weight: -10, sign: -1 },
  cost: { weight: -5, sign: -1 },
  executionDifficulty: { weight: -5, sign: -1 },
  uncertainty: { weight: -5, sign: -1 },
} as const;

export type ScoreFactor = keyof typeof SCORE_WEIGHTS;

export const SCORE_MAX_ABS = Object.values(SCORE_WEIGHTS).reduce((acc, { weight }) => acc + Math.abs(weight), 0) / 2;

export interface AddEvidenceInput {
  factor: string;
  quality?: string | null;
  claim: string;
  source?: string | null;
  value?: number | null; // 0..1 component value
}

interface EvidenceRow {
  id: string;
  opportunityId: string;
  factor: string;
  quality: string;
  claim: string;
  source: string | null;
  value: number;
  capturedAt: Date;
}

@Injectable()
export class OpportunityIntelligenceService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  private assertFactor(factor: string | undefined): ScoreFactor {
    if (typeof factor !== "string" || !(factor in SCORE_WEIGHTS)) {
      throw new BadRequestException(`factor must be one of: ${Object.keys(SCORE_WEIGHTS).join(", ")}`);
    }
    return factor as ScoreFactor;
  }

  private assertQuality(quality: string | null | undefined): EvidenceQuality {
    if (quality === undefined || quality === null) {
      throw new BadRequestException("quality is required");
    }
    if (!(EVIDENCE_QUALITIES as readonly string[]).includes(quality)) {
      throw new BadRequestException(`quality must be one of: ${EVIDENCE_QUALITIES.join(", ")}`);
    }
    return quality as EvidenceQuality;
  }

  private assertValue(value: number | null | undefined): number {
    if (value === undefined || value === null) {
      throw new BadRequestException("value is required");
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new BadRequestException("value must be a finite number in [0, 1]");
    }
    return value;
  }

  /** Record one evidence item against an opportunity (typed validation, no fabrication). */
  async addEvidence(opportunityId: string, input: AddEvidenceInput) {
    if (typeof input.claim !== "string" || !input.claim.trim()) {
      throw new BadRequestException("claim is required");
    }
    const factor = this.assertFactor(input.factor);
    const quality = this.assertQuality(input.quality);
    const value = this.assertValue(input.value);
    const existing = await this.client.opportunity.findUnique({ where: { id: opportunityId } });
    if (!existing) {
      throw new NotFoundException(`opportunity ${opportunityId} not found`);
    }
    return this.client.opportunityEvidence.create({
      data: {
        opportunityId,
        factor,
        quality,
        claim: input.claim.trim(),
        source: input.source?.trim() || null,
        value,
      },
    });
  }

  async listEvidence(opportunityId: string) {
    await this.requireOpportunity(opportunityId);
    return this.client.opportunityEvidence.findMany({
      where: { opportunityId },
      orderBy: { capturedAt: "desc" },
    });
  }

  /** Deterministic component score for one opportunity from its evidence rows. */
  async score(opportunityId: string) {
    await this.requireOpportunity(opportunityId);
    const evidence = (await this.client.opportunityEvidence.findMany({
      where: { opportunityId },
      orderBy: { capturedAt: "asc" },
    })) as unknown as EvidenceRow[];
    return this.computeScore(evidence);
  }

  /** Repeatable evidence-backed ranking: opportunities ordered by score (highest first). */
  async rank() {
    const opportunities = await this.client.opportunity.findMany({ orderBy: { createdAt: "asc" } });
    const evidence = (await this.client.opportunityEvidence.findMany({
      orderBy: { capturedAt: "asc" },
    })) as unknown as EvidenceRow[];
    const byOpportunity = new Map<string, EvidenceRow[]>();
    for (const row of evidence) {
      const list = byOpportunity.get(row.opportunityId) ?? [];
      list.push(row);
      byOpportunity.set(row.opportunityId, list);
    }
    const ranked = opportunities.map((opportunity) => ({
      opportunity,
      ...this.computeScore(byOpportunity.get(opportunity.id) ?? []),
    }));
    ranked.sort((a, b) => b.total - a.total || a.opportunity.createdAt.getTime() - b.opportunity.createdAt.getTime());
    return ranked;
  }

  private async requireOpportunity(id: string) {
    const existing = await this.client.opportunity.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`opportunity ${id} not found`);
    }
  }

  /**
   * Compute the canonical score from evidence rows. For each factor we take the
   * best-known value (highest-quality evidence for that factor wins; ties → first
   * captured). component = weight × value × qualityWeight; total is the bounded
   * sum of positive components minus negative components.
   */
  private computeScore(evidence: EvidenceRow[]) {
    const bestByFactor = new Map<ScoreFactor, { value: number; quality: EvidenceQuality; claim: string; source: string | null }>();
    for (const row of evidence) {
      if (!(row.factor in SCORE_WEIGHTS)) continue;
      const quality = this.qualityOrDefault(row.quality);
      const current = bestByFactor.get(row.factor as ScoreFactor);
      if (!current || QUALITY_WEIGHT[quality] > QUALITY_WEIGHT[current.quality]) {
        bestByFactor.set(row.factor as ScoreFactor, {
          value: row.value,
          quality,
          claim: row.claim,
          source: row.source,
        });
      }
    }

    const components: Array<{
      factor: ScoreFactor;
      weight: number;
      value: number;
      quality: EvidenceQuality;
      contribution: number;
    }> = [];
    let total = 0;
    for (const [factor, { weight, sign }] of Object.entries(SCORE_WEIGHTS) as Array<
      [ScoreFactor, { weight: number; sign: number }]
    >) {
      const best = bestByFactor.get(factor);
      const contribution = best
        ? sign * weight * best.value * QUALITY_WEIGHT[best.quality]
        : 0;
      components.push({
        factor,
        weight,
        value: best?.value ?? 0,
        quality: best?.quality ?? "UNKNOWN",
        contribution: Math.round(contribution * 1000) / 1000,
      });
      total += contribution;
    }

    return {
      weightsVersion: SCORE_WEIGHTS_VERSION,
      total: Math.round(total * 1000) / 1000,
      components,
    };
  }

  private qualityOrDefault(raw: string): EvidenceQuality {
    return (EVIDENCE_QUALITIES as readonly string[]).includes(raw) ? (raw as EvidenceQuality) : "UNKNOWN";
  }
}