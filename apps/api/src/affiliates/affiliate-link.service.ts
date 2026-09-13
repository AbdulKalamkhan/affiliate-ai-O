import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { buildTaggedUrl, extractAsin } from "./url/tag.util";
import { MANUAL_PRODUCT_PROVIDER, PRODUCT_DATA_PROVIDER, ProductDataProvider } from "./product-data/product-data.provider";

export const DEFAULT_ASSOCIATE_TAG = "zorajewellery-21";
export const DEFAULT_PROVIDER = "amazon-associates";

export interface CreateLinkInput {
  url: string;
  tag?: string;
  provider?: string;
  campaign?: string;
  offer?: string;
  title?: string;
  imageUrl?: string;
  price?: string;
  currency?: string;
}

export interface ClickMeta {
  userAgent?: string;
  referrer?: string;
}

@Injectable()
export class AffiliateLinkService {
  constructor(
    @Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient,
    @Inject(PRODUCT_DATA_PROVIDER) private readonly productData: ProductDataProvider = MANUAL_PRODUCT_PROVIDER,
  ) {}

  async createLink(input: CreateLinkInput) {
    if (typeof input.url !== "string" || !input.url.trim()) {
      throw new BadRequestException("url is required");
    }
    const tag = (input.tag ?? process.env.ASSOCIATE_TAG ?? DEFAULT_ASSOCIATE_TAG).trim();
    if (!tag) {
      throw new BadRequestException("associate tag is required");
    }
    let destination: string;
    try {
      destination = buildTaggedUrl(input.url.trim(), tag);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "invalid url");
    }
    const asin = extractAsin(input.url) ?? input.offer?.trim() ?? null;
    const provider = (input.provider ?? DEFAULT_PROVIDER).trim();

    // Product metadata is manual at Phase-00 (no PA-API). The provider boundary is
    // the Affiliate-01 adapter seam — a later PA-API adapter slots in via DI only.
    let product: { title?: string; imageUrl?: string; price?: string; currency?: string } = {
      title: input.title,
      imageUrl: input.imageUrl,
      price: input.price,
      currency: input.currency,
    };
    try {
      const enriched = await this.productData.fetch({ url: input.url, asin: asin ?? undefined });
      product = { ...product, ...enriched };
    } catch {
      // non-fatal: keep manual entry data when a product-data provider is unavailable
    }

    return this.client.affiliateLink.create({
      data: {
        provider,
        offer: asin,
        campaign: input.campaign?.trim() || null,
        destination,
        productTitle: product.title?.trim() || null,
        productImageUrl: product.imageUrl?.trim() || null,
        productPrice: product.price ? String(product.price).trim() : null,
        productCurrency: product.currency?.trim() || null,
      },
    });
  }

  async list() {
    return this.client.affiliateLink.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { clicks: true } } },
    });
  }

  async get(id: string) {
    const row = await this.client.affiliateLink.findUnique({
      where: { id },
      include: { _count: { select: { clicks: true } } },
    });
    if (!row) {
      throw new NotFoundException(`affiliate link ${id} not found`);
    }
    return row;
  }

  /** Records a click (privacy-aware: no IP stored) and returns the safe redirect destination. */
  async recordClick(id: string, meta: ClickMeta = {}): Promise<string> {
    const link = await this.client.affiliateLink.findUnique({ where: { id } });
    if (!link) {
      throw new NotFoundException(`affiliate link ${id} not found`);
    }
    let destination: URL;
    try {
      destination = new URL(link.destination);
    } catch {
      throw new BadRequestException("stored destination is not a valid URL");
    }
    if (destination.protocol !== "https:") {
      throw new BadRequestException("stored destination is not https");
    }
    await this.client.affiliateLinkClick.create({
      data: {
        linkId: id,
        userAgent: meta.userAgent?.slice(0, 512) || null,
        referrer: meta.referrer?.slice(0, 512) || null,
      },
    });
    return destination.toString();
  }

  async remove(id: string) {
    await this.get(id);
    await this.client.affiliateLink.delete({ where: { id } });
    return { deleted: true, id };
  }
}