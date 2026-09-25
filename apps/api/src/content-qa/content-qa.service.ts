import { Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { evaluateContentQa } from "./content-qa.rules";

@Injectable()
export class ContentQaService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  /** Evaluate BOTH QA gates for one content asset. Read-only — does not gate publish. */
  async evaluate(id: string) {
    const asset = await this.client.contentAsset.findUnique({
      where: { id },
      include: { link: true },
    });
    if (!asset) {
      throw new NotFoundException(`content asset ${id} not found`);
    }
    const siblingCount = await this.client.contentAsset.count({
      where: { title: asset.title, description: asset.description ?? null },
    });
    const view = {
      title: asset.title,
      description: asset.description,
      published: asset.published,
      disclosureAdded: asset.disclosureAdded,
      destination: asset.link?.destination ?? "",
      hasSiblingDuplicate: siblingCount > 1,
    };
    return { assetId: id, verdict: evaluateContentQa(view) };
  }
}