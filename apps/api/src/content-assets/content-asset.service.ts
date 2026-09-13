import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";

export interface CreateContentAssetInput {
  title: string;
  description?: string | null;
  linkId: string;
}

export interface UpdateContentAssetInput {
  title?: string;
  description?: string | null;
  published?: boolean;
  disclosureAdded?: boolean;
}

const LINK_INCLUDE = {
  link: { include: { _count: { select: { clicks: true } } } },
} as const;

@Injectable()
export class ContentAssetService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  private async assertLinkExists(linkId: string) {
    const link = await this.client.affiliateLink.findUnique({ where: { id: linkId } });
    if (!link) {
      throw new NotFoundException(`affiliate link ${linkId} not found`);
    }
    return link;
  }

  async create(input: CreateContentAssetInput) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      throw new BadRequestException("title is required");
    }
    await this.assertLinkExists(input.linkId);
    return this.client.contentAsset.create({
      data: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        linkId: input.linkId,
      },
      include: LINK_INCLUDE,
    });
  }

  async list() {
    return this.client.contentAsset.findMany({
      orderBy: { createdAt: "desc" },
      include: LINK_INCLUDE,
    });
  }

  async get(id: string) {
    const row = await this.client.contentAsset.findUnique({ where: { id }, include: LINK_INCLUDE });
    if (!row) {
      throw new NotFoundException(`content asset ${id} not found`);
    }
    return row;
  }

  async update(id: string, input: UpdateContentAssetInput) {
    const asset = await this.get(id);
    if (input.title !== undefined && (typeof input.title !== "string" || !input.title.trim())) {
      throw new BadRequestException("title must be a non-empty string");
    }
    const title = input.title !== undefined ? input.title.trim() : asset.title;
    const disclosure = input.disclosureAdded ?? asset.disclosureAdded;

    // Amazon/FTC compliance gate: disclosure must be present before publishing
    // (17_AMAZON_COMPLIANCE.md, SOC-04 content QA).
    if (input.published === true) {
      if (!title) {
        throw new BadRequestException("title is required before publishing");
      }
      if (!disclosure) {
        throw new BadRequestException(
          "affiliate disclosure must be added before publishing (Amazon compliance)",
        );
      }
    }
    // Cannot unset disclosure while the asset remains published.
    if (asset.published && input.disclosureAdded === false && input.published !== false) {
      throw new BadRequestException("disclosure cannot be removed while the asset is published");
    }

    const willBePublished = input.published ?? asset.published;
    const publishedAt =
      !asset.published && willBePublished ? new Date() : willBePublished ? asset.publishedAt : null;

    return this.client.contentAsset.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.published !== undefined ? { published: input.published } : {}),
        ...(input.disclosureAdded !== undefined ? { disclosureAdded: input.disclosureAdded } : {}),
        ...(publishedAt !== asset.publishedAt ? { publishedAt } : {}),
      },
      include: LINK_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.client.contentAsset.delete({ where: { id } });
    return { deleted: true, id };
  }
}