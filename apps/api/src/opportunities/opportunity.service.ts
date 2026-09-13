import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";

export const OPPORTUNITY_STATUSES = ["researching", "shortlisted", "live"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export interface CreateOpportunityInput {
  name: string;
  category?: string | null;
  notes?: string | null;
  status?: string | null;
}

@Injectable()
export class OpportunityService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  private assertStatus(status?: string | null): void {
    if (status !== undefined && status !== null && !(OPPORTUNITY_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`status must be one of: ${OPPORTUNITY_STATUSES.join(", ")}`);
    }
  }

  async create(input: CreateOpportunityInput) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new BadRequestException("name is required");
    }
    this.assertStatus(input.status);
    return this.client.opportunity.create({
      data: {
        name: input.name.trim(),
        category: input.category?.trim() || null,
        notes: input.notes?.trim() || null,
        status: input.status ?? "researching",
      },
    });
  }

  async list() {
    return this.client.opportunity.findMany({ orderBy: { createdAt: "desc" } });
  }

  async get(id: string) {
    const row = await this.client.opportunity.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`opportunity ${id} not found`);
    }
    return row;
  }

  async update(id: string, input: Partial<CreateOpportunityInput>) {
    await this.get(id);
    if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim())) {
      throw new BadRequestException("name must be a non-empty string");
    }
    this.assertStatus(input.status);
    return this.client.opportunity.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.status !== undefined && input.status !== null ? { status: input.status } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.client.opportunity.delete({ where: { id } });
    return { deleted: true, id };
  }
}