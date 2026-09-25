import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { Prisma } from "@ai-os/database";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import { generatePlan, evaluatePermission } from "./boss-plan-generator";

export const AUTONOMY_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 2;

export const BOSS_COMMAND_STATUSES = ["received", "planned", "archived"] as const;
export type BossCommandStatus = (typeof BOSS_COMMAND_STATUSES)[number];

export const BOSS_COMMAND_TEXT_MAX_LENGTH = 4000;

export interface CreateBossCommandInput {
  text: string;
  autonomyLevel?: number;
}

@Injectable()
export class BossService {
  constructor(@Inject(DB_CLIENT) private readonly client: DbClient = prisma as DbClient) {}

  private assertAutonomy(autonomyLevel: number | undefined): AutonomyLevel {
    if (autonomyLevel === undefined || autonomyLevel === null) return DEFAULT_AUTONOMY_LEVEL;
    if (!Number.isInteger(autonomyLevel) || !(AUTONOMY_LEVELS as readonly number[]).includes(autonomyLevel)) {
      throw new BadRequestException(`autonomyLevel must be an integer in ${AUTONOMY_LEVELS.join("..")}`);
    }
    return autonomyLevel as AutonomyLevel;
  }

  private assertStatus(status?: string | null): void {
    if (status !== undefined && status !== null && !(BOSS_COMMAND_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`status must be one of: ${BOSS_COMMAND_STATUSES.join(", ")}`);
    }
  }

  private audit(
    commandId: string,
    entityType: string,
    entityId: string,
    verb: string,
    detail?: Prisma.InputJsonValue,
  ) {
    return this.client.bossAuditLog.create({
      data: {
        commandId,
        entityType,
        entityId,
        verb,
        ...(detail ? { detail } : {}),
      },
    });
  }

  /** Owner command intake → structured, auditable plan. Never executes tools in Phase-01. */
  async create(input: CreateBossCommandInput) {
    if (typeof input.text !== "string" || !input.text.trim()) {
      throw new BadRequestException("text is required");
    }
    const text = input.text.trim();
    if (text.length > BOSS_COMMAND_TEXT_MAX_LENGTH) {
      throw new BadRequestException(`text must be at most ${BOSS_COMMAND_TEXT_MAX_LENGTH} characters`);
    }
    const autonomyLevel = this.assertAutonomy(input.autonomyLevel);

    const command = await this.client.bossCommand.create({
      data: { text, autonomyLevel, status: "received" as BossCommandStatus },
    });
    await this.audit(command.id, "command", command.id, "created", { autonomyLevel });

    const planModel = generatePlan(text);
    const plan = await this.client.bossPlan.create({
      data: {
        commandId: command.id,
        objective: planModel.objective,
        status: "planned",
      },
    });
    await this.audit(command.id, "plan", plan.id, "created", { intent: planModel.intent });

    let order = 0;
    for (const plannedTask of planModel.tasks) {
      order += 1;
      const task = await this.client.bossTask.create({
        data: {
          planId: plan.id,
          order,
          title: plannedTask.title,
          status: "planned",
        },
      });
      await this.audit(command.id, "task", task.id, "created", { order });

      for (const plannedAction of plannedTask.actions) {
        const permission = evaluatePermission(plannedAction.tool, autonomyLevel);
        const actionRow = await this.client.bossAction.create({
          data: {
            taskId: task.id,
            tool: plannedAction.tool,
            input: plannedAction.input,
            autonomyLevel: permission.autonomyLevel,
            requiredAutonomy: permission.requiredAutonomy,
            permissionResult: permission.granted ? "granted" : "denied",
            status: "proposed",
          },
        });
        await this.audit(command.id, "action", actionRow.id, "permission_checked", {
          tool: permission.tool,
          requiredAutonomy: permission.requiredAutonomy,
          autonomyLevel: permission.autonomyLevel,
          granted: permission.granted,
        });
      }
    }

    await this.client.bossCommand.update({
      where: { id: command.id },
      data: { status: "planned" as BossCommandStatus },
    });
    await this.audit(command.id, "command", command.id, "planned");

    return this.get(command.id);
  }

  async list() {
    return this.client.bossCommand.findMany({ orderBy: { createdAt: "desc" } });
  }

  async get(id: string) {
    const row = await this.client.bossCommand.findUnique({
      where: { id },
      include: {
        plan: { include: { tasks: { include: { actions: true } } } },
        auditLogs: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!row) {
      throw new NotFoundException(`boss command ${id} not found`);
    }
    return row;
  }

  async update(id: string, input: Partial<Pick<CreateBossCommandInput, "autonomyLevel"> & { status?: string | null }>) {
    const existing = await this.get(id);
    const autonomyLevel = input.autonomyLevel !== undefined ? this.assertAutonomy(input.autonomyLevel) : undefined;
    this.assertStatus(input.status);
    const data: Record<string, unknown> = {
      ...(autonomyLevel !== undefined ? { autonomyLevel } : {}),
      ...(input.status !== undefined && input.status !== null ? { status: input.status } : {}),
    };
    if (Object.keys(data).length === 0) {
      return existing;
    }
    await this.audit(existing.id, "command", existing.id, "updated", {
      ...(autonomyLevel !== undefined ? { autonomyLevel } : {}),
      ...(input.status !== undefined && input.status !== null ? { status: input.status } : {}),
    });
    return this.client.bossCommand.update({ where: { id }, data });
  }

  /** Safe removal: archives the command (soft-delete) so the audit trail survives. */
  async remove(id: string) {
    await this.get(id);
    await this.audit(id, "command", id, "archived");
    await this.client.bossCommand.update({
      where: { id },
      data: { status: "archived" as BossCommandStatus },
    });
    return { archived: true, id };
  }
}