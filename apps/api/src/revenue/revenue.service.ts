import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";

export const DEFAULT_CURRENCY = "INR";
export const EVENT_STATUSES = ["pending", "reconciled", "rejected"] as const;
export const REVENUE_STATUSES = EVENT_STATUSES;
export type RevenueEventStatus = (typeof EVENT_STATUSES)[number];

export interface RecordRevenueInput {
  provider: string;
  sourceId?: string;
  eventType?: string;
  value: number;
  currency?: string;
  linkId?: string;
  occurredAt?: Date;
}

export interface ReconcileRevenueInput {
  grossAmount: number;
  feeAmount: number;
  costAmount: number;
  currency?: string;
  source?: string;
}

const isFiniteNonNegative = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

@Injectable()
export class RevenueService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  async record(input: RecordRevenueInput) {
    if (typeof input.provider !== "string" || !input.provider.trim()) {
      throw new BadRequestException("provider is required");
    }
    if (!isFiniteNonNegative(input.value) || input.value <= 0) {
      throw new BadRequestException("value must be a positive finite number");
    }
    if (input.linkId !== undefined && input.linkId !== null && typeof input.linkId !== "string") {
      throw new BadRequestException("linkId must be a string");
    }

    const provider = input.provider.trim();
    const sourceId = input.sourceId?.trim() || null;

    // Idempotency: if the provider+sourceId pair already exists, return the existing
    // event instead of creating a duplicate. Requires sourceId (provider's own id).
    if (sourceId) {
      const existing = await this.client.revenueEvent.findMany({
        where: { provider, sourceId },
        take: 1,
      });
      if (existing.length > 0) return existing[0];
    }

    return this.client.revenueEvent.create({
      data: {
        provider,
        sourceId,
        eventType: input.eventType?.trim() || "sale",
        value: input.value,
        currency: input.currency?.trim() || DEFAULT_CURRENCY,
        linkId: input.linkId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
        status: "pending",
      },
    });
  }

  async list() {
    return this.client.revenueEvent.findMany({ orderBy: { occurredAt: "desc" } });
  }

  async get(id: string) {
    // Audit trail: include the linked ProfitRecord so a single event read exposes the
    // full verified chain (evidence event + reconciled profit record).
    const row = await this.client.revenueEvent.findUnique({
      where: { id },
      include: { profitRecord: true },
    });
    if (!row) {
      throw new NotFoundException(`revenue event ${id} not found`);
    }
    return row;
  }

  /**
   * Verifies a pending revenue event against provider evidence and creates the
   * profit record. Never treat gross sales as profit: netProfit = gross - fee - cost.
   * Only a pending event may be reconciled; a reconciled/rejected event is final.
   */
  async reconcile(id: string, input: ReconcileRevenueInput) {
    const event = await this.get(id);
    if (event.status !== "pending") {
      throw new BadRequestException(`only pending revenue events can be reconciled (current: ${event.status})`);
    }
    for (const field of ["grossAmount", "feeAmount", "costAmount"] as const) {
      if (!isFiniteNonNegative(input[field])) {
        throw new BadRequestException(`${field} must be a non-negative finite number`);
      }
    }
    if (input.source !== undefined && input.source !== null && typeof input.source !== "string") {
      throw new BadRequestException("source must be a string");
    }
    const grossAmount = input.grossAmount;
    const feeAmount = input.feeAmount;
    const costAmount = input.costAmount;
    const netProfit = grossAmount - feeAmount - costAmount;
    const source = input.source?.trim() || `${event.provider}:${event.sourceId ?? event.id}`;

    // Create the profit record first; the revenue event's reconciled status is the
    // commit point (retrying reconcile after a partial failure is then safe).
    const profitRecord = await this.client.profitRecord.create({
      data: {
        sourceType: "affiliate",
        source,
        grossAmount,
        feeAmount,
        costAmount,
        netProfit,
        currency: input.currency?.trim() || event.currency || DEFAULT_CURRENCY,
        revenueEventId: id,
        recordedAt: new Date(),
      },
    });
    await this.client.revenueEvent.update({ where: { id }, data: { status: "reconciled" } });

    return { event: { ...event, status: "reconciled" as const, profitRecord }, profitRecord };
  }

  async reject(id: string) {
    const event = await this.get(id);
    if (event.status !== "pending") {
      throw new BadRequestException(`only pending revenue events can be rejected (current: ${event.status})`);
    }
    return this.client.revenueEvent.update({ where: { id }, data: { status: "rejected" } });
  }
}