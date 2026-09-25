import { Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { evaluateContentQa } from "./content-qa.rules";

// Asset state (current or prospective) that QA evaluates. `destination` is read
// from the affiliate link so a non-Amazon destination fails the network gate.
export interface QaAssetRecord {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  disclosureAdded: boolean;
  destination: string;
}

export interface QaEvaluation {
  assetId: string;
  verdict: ReturnType<typeof evaluateContentQa>;
}

@Injectable()
export class ContentQaService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  private async evaluateRecord(record: QaAssetRecord): Promise<QaEvaluation> {
    // Self-inclusive sibling count: equals "other duplicates exist" both when the
    // prospective title/description match the stored row (self + others > 1) and
    // when they differ (only the EXACT duplicates count, self excluded naturally).
    const siblings = await this.client.contentAsset.count({
      where: { title: record.title, description: record.description ?? null },
    });
    return {
      assetId: record.id,
      verdict: evaluateContentQa({
        title: record.title,
        description: record.description,
        published: record.published,
        disclosureAdded: record.disclosureAdded,
        destination: record.destination,
        hasSiblingDuplicate: siblings > 1,
      }),
    };
  }

  /** GET /content-qa/assets/:id — read-only evaluation of the stored state. */
  async evaluate(id: string): Promise<QaEvaluation> {
    const asset = await this.client.contentAsset.findUnique({ where: { id }, include: { link: true } });
    if (!asset) {
      throw new NotFoundException(`content asset ${id} not found`);
    }
    return this.evaluateRecord({
      id: asset.id,
      title: asset.title,
      description: asset.description ?? null,
      published: asset.published,
      disclosureAdded: asset.disclosureAdded,
      destination: asset.link?.destination ?? "",
    });
  }

  /** QA-01: evaluate a PROSPECTIVE state before it is persisted (used by the publish gate). */
  evaluateState(record: QaAssetRecord): Promise<QaEvaluation> {
    return this.evaluateRecord(record);
  }
}