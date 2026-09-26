// Phase-04 QA-01 approval model.
//
// REPLACES the previous hardcoded `PRE_APPROVED_PUBLISH_ASSET_IDS` bypass.
//
// Why: a hardcoded asset id in source is not an approval mechanism — it has no
// approver, no timestamp, no reason and no audit trail. The live Campaign #3
// asset must keep working, so its pre-existing publish approval is MIGRATED into
// a real, immutable approval record instead of being deleted.
//
// The migration path is explicit and auditable:
//   1. `publish_approvals` table (assetId, approvedBy, reason, evidence, grantedAt)
//   2. legacy pre-approved ids are inserted as approvals with
//      approvedBy="owner-migration" and a reason naming the original intent
//   3. the QA gate consults approvals, not a hardcoded set
//
// Nothing about the live asset changes behaviour: it stays publishable, and now
// for a defensible reason.

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";

/** Ids that were hardcoded before this table existed. Migration seed only. */
export const LEGACY_PRE_APPROVED_ASSET_IDS: readonly string[] = ["cmuczfp6y0002ah1g7fjqmuxd"];

export interface PublishApprovalView {
  id: string;
  assetId: string;
  approvedBy: string;
  reason: string;
  evidence: unknown;
  grantedAt: Date;
  source: string;
}

@Injectable()
export class PublishApprovalService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  /** Grant a publish approval. Re-granting for the same asset is a no-op. */
  async grant(input: {
    assetId: string;
    approvedBy: string;
    reason: string;
    evidence?: unknown;
    source?: string;
  }): Promise<PublishApprovalView> {
    if (!input.assetId?.trim()) throw new BadRequestException("assetId is required");
    if (!input.approvedBy?.trim()) throw new BadRequestException("approvedBy is required");
    if (!input.reason?.trim()) throw new BadRequestException("reason is required for every publish approval");

    const existing = await this.client.publishApproval.findMany({
      where: { assetId: input.assetId.trim() },
      orderBy: { grantedAt: "desc" },
      take: 1,
    });
    if (existing[0]) return existing[0] as unknown as PublishApprovalView;

    const row = await this.client.publishApproval.create({
      data: {
        assetId: input.assetId.trim(),
        approvedBy: input.approvedBy.trim(),
        reason: input.reason.trim(),
        evidence: (input.evidence ?? null) as never,
        source: input.source ?? "owner",
      },
    });
    return row as unknown as PublishApprovalView;
  }

  async findForAsset(assetId: string): Promise<PublishApprovalView | null> {
    const rows = await this.client.publishApproval.findMany({
      where: { assetId },
      orderBy: { grantedAt: "desc" },
      take: 1,
    });
    return (rows[0] as unknown as PublishApprovalView) ?? null;
  }

  async hasApproval(assetId: string): Promise<boolean> {
    return (await this.findForAsset(assetId)) !== null;
  }

  async list(): Promise<PublishApprovalView[]> {
    const rows = await this.client.publishApproval.findMany({ orderBy: { grantedAt: "desc" } });
    return rows as unknown as PublishApprovalView[];
  }

  /**
   * One-time, idempotent migration of the legacy hardcoded ids into real
   * approval records. Safe to call on every boot: already-migrated ids are
   * skipped, so production converges to the same state as a fresh database.
   */
  async migrateLegacyApprovals(): Promise<{ migrated: string[]; skipped: string[] }> {
    const migrated: string[] = [];
    const skipped: string[] = [];
    for (const assetId of LEGACY_PRE_APPROVED_ASSET_IDS) {
      if (await this.hasApproval(assetId)) {
        skipped.push(assetId);
        continue;
      }
      await this.grant({
        assetId,
        approvedBy: "owner-migration",
        reason:
          "Pre-existing live Campaign #3 asset, published 2026-09-25 before the QA engine existed. " +
          "Approval migrated verbatim from the previous hardcoded PRE_APPROVED_PUBLISH_ASSET_IDS set so the " +
          "running campaign is never blocked; no QA verdict was fabricated for it.",
        evidence: { legacyHardcodedBypass: true, migratedFrom: "PRE_APPROVED_PUBLISH_ASSET_IDS" },
        source: "migration",
      });
      migrated.push(assetId);
    }
    return { migrated, skipped };
  }

  async assertApprovalExists(assetId: string): Promise<void> {
    if (!(await this.hasApproval(assetId))) {
      throw new NotFoundException(`no publish approval recorded for asset ${assetId}`);
    }
  }
}
