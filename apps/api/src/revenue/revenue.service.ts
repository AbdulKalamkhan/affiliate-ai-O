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
  /** Who caused the write (API principal, sync job, or the executor). */
  actor?: string;
}

export interface ReconcileRevenueInput {
  grossAmount: number;
  feeAmount: number;
  costAmount: number;
  currency?: string;
  source?: string;
  actor?: string;
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
    const actor = input.actor?.trim() || "system";

    // Money write: revenue event + audit row commit together, and the provider
    // + sourceId idempotency check runs INSIDE the transaction so two concurrent
    // ingests of the same provider event cannot both create a duplicate.
    return this.client.$transaction(async (tx) => {
      if (sourceId) {
        const existing = await tx.revenueEvent.findMany({
          where: { provider, sourceId },
          take: 1,
        });
        if (existing.length > 0) return existing[0];
      }

      const event = await tx.revenueEvent.create({
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

      await tx.bossAuditLog.create({
        data: {
          commandId: null,
          actor,
          entityType: "revenue_event",
          entityId: event.id,
          verb: "money_write",
          detail: {
            reason: "revenue event recorded",
            provider: event.provider,
            sourceId: event.sourceId,
            eventType: event.eventType,
            value: event.value,
            currency: event.currency,
            status: event.status,
          },
        },
      });

      return event;
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
    const actor = input.actor?.trim() || "system";

    // Atomic money write: the profit record, the event's reconciled status and the
    // audit row all commit together. A failure at any step leaves the event PENDING,
    // so a retry cannot double-count profit or leave an unreconciled profit record.
    return this.client.$transaction(async (tx) => {
      const profitRecord = await tx.profitRecord.create({
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
      const updated = await tx.revenueEvent.update({ where: { id }, data: { status: "reconciled" } });

      await tx.bossAuditLog.create({
        data: {
          commandId: null,
          actor,
          entityType: "profit_record",
          entityId: profitRecord.id,
          verb: "money_write",
          detail: {
            reason: "revenue event reconciled",
            revenueEventId: id,
            source,
            grossAmount,
            feeAmount,
            costAmount,
            netProfit,
            currency: profitRecord.currency,
          },
        },
      });

      return { event: { ...updated, profitRecord }, profitRecord };
    });
  }

  async reject(id: string, actor = "system") {
    const event = await this.get(id);
    if (event.status !== "pending") {
      throw new BadRequestException(`only pending revenue events can be rejected (current: ${event.status})`);
    }
    return this.client.$transaction(async (tx) => {
      const updated = await tx.revenueEvent.update({ where: { id }, data: { status: "rejected" } });
      await tx.bossAuditLog.create({
        data: {
          commandId: null,
          actor,
          entityType: "revenue_event",
          entityId: id,
          verb: "money_write",
          detail: { reason: "revenue event rejected", previousStatus: "pending", status: "rejected" },
        },
      });
      return updated;
    });
  }

  /**
   * Revenue concentration KPI (Affiliate-07). Only RECONCILED (verified) events
   * count toward revenue — pending/rejected never inflate the measure. If a single
   * provider/network exceeds 90% of verified revenue a risk alert is raised for the
   * CEO report. Network adapters stay independent; no second provider is introduced.
   */
  async concentration() {
    const events = await this.client.revenueEvent.findMany({ where: { status: "reconciled" } });
    const byProvider = new Map<string, number>();
    const currencies = new Map<string, string>();
    let total = 0;
    for (const event of events) {
      const value = Number(event.value);
      total += value;
      byProvider.set(event.provider, (byProvider.get(event.provider) ?? 0) + value);
      currencies.set(event.provider, event.currency || DEFAULT_CURRENCY);
    }

    const CONCENTRATION_THRESHOLD = 0.9;
    const providers = [...byProvider.entries()].map(([provider, amount]) => {
      const share = total > 0 ? amount / total : 0;
      return {
        provider,
        amount: Math.round(amount * 100) / 100,
        currency: currencies.get(provider) ?? DEFAULT_CURRENCY,
        sharePct: Math.round(share * 10000) / 100,
        riskAlert: share > CONCENTRATION_THRESHOLD,
      };
    });

    return {
      totalRevenue: Math.round(total * 100) / 100,
      currency: providers[0]?.currency ?? DEFAULT_CURRENCY,
      providerCount: providers.length,
      concentrationThresholdPct: CONCENTRATION_THRESHOLD * 100,
      riskAlerts: providers.filter((p) => p.riskAlert),
      providers,
    };
  }
}