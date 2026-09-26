import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { Prisma } from "@ai-os/database";
import { prisma } from "@ai-os/database";

import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import {
  CURRENCY,
  LISTING_STATUSES,
  UNKNOWN,
  applyInventoryAdjustment,
  buildListingDraft,
  calculateNetProfit,
  type InventorySnapshot,
  type ListingStatus,
  type ProfitBreakdown,
} from "./seller-domain";

@Injectable()
export class SellerService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  // ------------------------------------------------------------- products

  async createProduct(input: {
    sku?: string;
    title: string;
    description?: string;
    brand?: string;
    category?: string;
    costPrice?: number;
    currency?: string;
    source?: string;
  }) {
    if (!input.title?.trim()) throw new BadRequestException("title is required");
    const product = await this.client.product.create({
      data: {
        title: input.title.trim(),
        ...(input.sku ? { sku: input.sku.trim() } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.brand ? { brand: input.brand } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
        currency: input.currency ?? CURRENCY,
        source: input.source ?? "manual",
      },
    });
    return product;
  }

  async listProducts() {
    return this.client.product.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getProduct(id: string) {
    const rows = await this.client.product.findMany({ where: { id }, take: 1 });
    if (!rows[0]) throw new NotFoundException(`product ${id} not found`);
    return rows[0];
  }

  // ------------------------------------------------------------ listings

  /**
   * Generate a listing DRAFT from verified product data. The draft is validated
   * deterministically and persisted with a version row so the full history of
   * generated listings is auditable. Nothing is published anywhere.
   */
  async createListingDraft(input: {
    sellerId: string;
    productId?: string;
    platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
    title: string;
    description?: string;
    bullets?: string[];
    attributes?: Record<string, string>;
    price?: number;
    keywords?: string[];
  }) {
    const seller = await this.getSeller(input.sellerId);
    const draft = buildListingDraft({
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.bullets !== undefined ? { bullets: input.bullets } : {}),
      ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
    });
    const status: ListingStatus = draft.validation.valid ? "pending_approval" : "draft";

    const listing = await this.client.sellerListing.create({
      data: {
        sellerId: input.sellerId,
        ...(input.productId ? { productId: input.productId } : {}),
        platform: input.platform,
        status,
        title: draft.title,
        description: draft.description || null,
        bullets: draft.bullets,
        attributes: draft.attributes,
        ...(typeof draft.price === "number" ? { price: draft.price } : {}),
        currency: CURRENCY,
      },
    });

    const versions = await this.client.sellerListingVersion.findMany({
      where: { listingId: listing.id },
      orderBy: { version: "desc" },
      take: 1,
    });
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    await this.client.sellerListingVersion.create({
      data: {
        listingId: listing.id,
        version: nextVersion,
        payload: draft as unknown as Prisma.InputJsonValue,
        status,
        notes: draft.validation.valid
          ? "generated draft passed deterministic validation"
          : `validation failed: ${draft.validation.violations.map((v) => v.code).join(", ")}`,
      },
    });

    return {
      listing,
      draft,
      version: nextVersion,
      sellerPlatform: seller.platform,
      published: false,
      note: "Draft only — no marketplace was contacted. Publishing requires a connected adapter.",
    };
  }

  async listListings(sellerId?: string) {
    return this.client.sellerListing.findMany({
      where: sellerId ? { sellerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async updateListingStatus(id: string, status: string) {
    if (!(LISTING_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`status must be one of: ${LISTING_STATUSES.join(", ")}`);
    }
    const existing = await this.client.sellerListing.findMany({ where: { id }, take: 1 });
    if (!existing[0]) throw new NotFoundException(`listing ${id} not found`);
    return this.client.sellerListing.update({ where: { id }, data: { status } });
  }

  // ----------------------------------------------------------- inventory

  private async inventorySnapshot(sellerId: string, sku: string): Promise<InventorySnapshot> {
    const rows = await this.client.sellerInventory.findMany({
      where: { sellerId, sku },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const row = rows[0];
    return {
      available: Number(row?.availableQty ?? 0),
      reserved: Number(row?.reservedQty ?? 0),
      sold: Number(row?.soldQty ?? 0),
    };
  }

  /**
   * Idempotent-by-intent stock adjustment that refuses to create negative
   * inventory. A rejected adjustment returns the unchanged snapshot plus the
   * reason, so the caller can surface the refusal instead of corrupting stock.
   */
  async adjustInventory(input: {
    sellerId: string;
    sku: string;
    productId?: string;
    available?: number;
    reserved?: number;
    sold?: number;
    reason: string;
  }) {
    if (!input.sku?.trim()) throw new BadRequestException("sku is required");
    if (!input.reason?.trim()) throw new BadRequestException("reason is required for every stock movement");
    const current = await this.inventorySnapshot(input.sellerId, input.sku.trim());
    const result = applyInventoryAdjustment(current, {
      ...(input.available !== undefined ? { available: input.available } : {}),
      ...(input.reserved !== undefined ? { reserved: input.reserved } : {}),
      ...(input.sold !== undefined ? { sold: input.sold } : {}),
      reason: input.reason,
    });

    if (!result.ok) {
      return { applied: false as const, reason: result.reason, snapshot: result.snapshot };
    }

    const existing = await this.client.sellerInventory.findMany({
      where: { sellerId: input.sellerId, sku: input.sku.trim() },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const row = existing[0];
    const saved = row
      ? await this.client.sellerInventory.update({
          where: { id: row.id },
          data: {
            availableQty: result.snapshot.available,
            reservedQty: result.snapshot.reserved,
            soldQty: result.snapshot.sold,
          },
        })
      : await this.client.sellerInventory.create({
          data: {
            sellerId: input.sellerId,
            sku: input.sku.trim(),
            ...(input.productId ? { productId: input.productId } : {}),
            availableQty: result.snapshot.available,
            reservedQty: result.snapshot.reserved,
            soldQty: result.snapshot.sold,
            currency: CURRENCY,
          },
        });
    return { applied: true as const, inventory: saved, delta: result.delta, snapshot: result.snapshot };
  }

  async listInventory(sellerId?: string) {
    return this.client.sellerInventory.findMany({
      where: sellerId ? { sellerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  // -------------------------------------------------------------- orders

  /**
   * Ingest a marketplace order. `externalId` is unique per platform, so a
   * repeated sync is a no-op rather than a duplicate order. This endpoint never
   * invents orders — it only records what a caller supplies as verified.
   */
  async ingestOrder(input: {
    sellerId: string;
    platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
    externalId: string;
    status?: string;
    totalAmount: number;
    currency?: string;
    items?: { sku?: string; title: string; quantity: number; unitPrice: number }[];
    raw?: Prisma.InputJsonValue;
  }) {
    if (!input.externalId?.trim()) throw new BadRequestException("externalId is required");
    if (typeof input.totalAmount !== "number" || !Number.isFinite(input.totalAmount)) {
      throw new BadRequestException("totalAmount must be a verified number");
    }
    await this.getSeller(input.sellerId);

    const existing = await this.client.sellerOrder.findMany({
      where: { platform: input.platform, externalId: input.externalId.trim() },
      take: 1,
    });
    if (existing[0]) {
      return { created: false as const, order: existing[0], reason: "order already ingested (idempotent)" };
    }

    const order = await this.client.sellerOrder.create({
      data: {
        sellerId: input.sellerId,
        externalId: input.externalId.trim(),
        platform: input.platform,
        status: input.status ?? "pending",
        totalAmount: input.totalAmount,
        currency: input.currency ?? CURRENCY,
        ...(input.raw !== undefined ? { raw: input.raw } : {}),
      },
    });
    for (const item of input.items ?? []) {
      if (typeof item.quantity !== "number" || item.quantity <= 0) {
        throw new BadRequestException("order item quantity must be a positive verified number");
      }
      await this.client.sellerOrderItem.create({
        data: {
          orderId: order.id,
          ...(item.sku ? { sku: item.sku } : {}),
          title: item.title,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: Number((item.unitPrice * item.quantity).toFixed(2)),
          currency: input.currency ?? CURRENCY,
        },
      });
    }
    return { created: true as const, order };
  }

  async listOrders(sellerId?: string) {
    return this.client.sellerOrder.findMany({
      where: sellerId ? { sellerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  // ------------------------------------------------------------- returns

  async recordReturn(input: {
    sellerId: string;
    platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
    externalId?: string;
    orderId?: string;
    amount: number;
    status?: string;
    reason?: string;
    currency?: string;
    raw?: Prisma.InputJsonValue;
  }) {
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount)) {
      throw new BadRequestException("amount must be a verified number");
    }
    await this.getSeller(input.sellerId);
    return this.client.sellerReturn.create({
      data: {
        sellerId: input.sellerId,
        platform: input.platform,
        amount: input.amount,
        status: input.status ?? "requested",
        ...(input.externalId ? { externalId: input.externalId } : {}),
        ...(input.orderId ? { orderId: input.orderId } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.raw !== undefined ? { raw: input.raw } : {}),
        currency: input.currency ?? CURRENCY,
      },
    });
  }

  async listReturns(sellerId?: string) {
    return this.client.sellerReturn.findMany({
      where: sellerId ? { sellerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  // --------------------------------------------------------- settlement

  /**
   * Record a verified settlement and derive seller profit. Components that the
   * settlement does not state stay UNKNOWN, so `netProfit` is null rather than
   * an optimistic number.
   */
  async recordSettlement(input: {
    sellerId: string;
    platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
    externalId?: string;
    totalAmount: number;
    fees?: number;
    refunds?: number;
    cogs?: number;
    shipping?: number;
    otherCosts?: number;
    status?: string;
    periodStart?: Date;
    periodEnd?: Date;
    currency?: string;
  }) {
    await this.getSeller(input.sellerId);
    const profit: ProfitBreakdown = calculateNetProfit({
      revenue: input.totalAmount,
      cogs: input.cogs ?? UNKNOWN,
      fees: input.fees ?? UNKNOWN,
      shipping: input.shipping ?? UNKNOWN,
      refunds: input.refunds ?? UNKNOWN,
      otherCosts: input.otherCosts ?? UNKNOWN,
    });
    const settlement = await this.client.sellerSettlement.create({
      data: {
        sellerId: input.sellerId,
        platform: input.platform,
        ...(input.externalId ? { externalId: input.externalId } : {}),
        totalAmount: input.totalAmount,
        fees: input.fees ?? 0,
        refunds: input.refunds ?? 0,
        // Persist the derived net only when the money is actually complete.
        netAmount: profit.netProfit ?? 0,
        status: input.status ?? "pending",
        ...(input.periodStart ? { periodStart: input.periodStart } : {}),
        ...(input.periodEnd ? { periodEnd: input.periodEnd } : {}),
        currency: input.currency ?? CURRENCY,
      },
    });
    return {
      settlement,
      profit,
      note: profit.isComplete
        ? "net profit derived from verified settlement components"
        : "net profit UNKNOWN — settlement did not state every cost component",
    };
  }

  async listSettlements(sellerId?: string) {
    return this.client.sellerSettlement.findMany({
      where: sellerId ? { sellerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  // ------------------------------------------------------------- sellers

  async createSeller(input: {
    platform: "AMAZON_SELLER" | "FLIPKART_SELLER" | "MEESHO_SUPPLIER";
    displayName: string;
    externalId?: string;
  }) {
    if (!input.displayName?.trim()) throw new BadRequestException("displayName is required");
    return this.client.sellerAccount.create({
      data: {
        platform: input.platform,
        displayName: input.displayName.trim(),
        ...(input.externalId ? { externalId: input.externalId } : {}),
        status: "inactive",
        connected: false,
      },
    });
  }

  async listSellers() {
    return this.client.sellerAccount.findMany({ orderBy: { createdAt: "desc" } });
  }

  private async getSeller(id: string) {
    const rows = await this.client.sellerAccount.findMany({ where: { id }, take: 1 });
    if (!rows[0]) throw new NotFoundException(`seller account ${id} not found`);
    return rows[0];
  }

  async setPermissions(sellerId: string, permissions: { permission: string; granted: boolean; expiresAt?: Date }[]) {
    await this.getSeller(sellerId);
    const out = [];
    for (const permission of permissions) {
      const existing = await this.client.sellerPermission.findMany({
        where: { sellerId, permission: permission.permission },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      const data = {
        granted: permission.granted,
        ...(permission.expiresAt ? { expiresAt: permission.expiresAt } : {}),
      };
      out.push(
        existing[0]
          ? await this.client.sellerPermission.update({ where: { id: existing[0].id }, data })
          : await this.client.sellerPermission.create({
              data: { sellerId, permission: permission.permission, ...data },
            }),
      );
    }
    return out;
  }

  async listPermissions(sellerId?: string) {
    return this.client.sellerPermission.findMany({
      where: sellerId ? { sellerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  /** Seller overview for the Seller Control Center — honest about empties. */
  async overview() {
    const [sellers, listings, inventory, orders, returns, settlements] = await Promise.all([
      this.client.sellerAccount.count(),
      this.client.sellerListing.count(),
      this.client.sellerInventory.count(),
      this.client.sellerOrder.count(),
      this.client.sellerReturn.count(),
      this.client.sellerSettlement.count(),
    ]);
    return {
      sellers,
      listings,
      inventoryRecords: inventory,
      orders,
      returns,
      settlements,
      connectedMarketplaces: 0,
      status:
        sellers === 0
          ? "Awaiting data — no seller account created yet"
          : "Foundation active — no marketplace connected",
    };
  }
}
