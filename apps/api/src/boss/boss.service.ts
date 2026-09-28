import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { Prisma } from "@ai-os/database";
import { prisma } from "@ai-os/database";
import type { DbClient } from "../db/db-client";
import { DB_CLIENT } from "../db/tokens";
import {
  AUTONOMY_LEVELS,
  DEFAULT_AUTONOMY_LEVEL,
  resolveEffectiveAutonomy,
  type AutonomyLevel,
  type AutonomyResolution,
} from "../security/autonomy";
import { UNRESOLVED_PRINCIPAL, type Principal } from "../security/principal";
import { generatePlan, evaluatePermission } from "./boss-plan-generator";

export { AUTONOMY_LEVELS, DEFAULT_AUTONOMY_LEVEL };
export type { AutonomyLevel };

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

  /**
   * A level in the request body is a REQUEST, not an authority. The persisted
   * level is the server's: capped by OPERATOR_AUTONOMY_CEILING, with level 5
   * reserved for an owner principal plus an explicit opt-in. Default principal
   * fails CLOSED, so a direct call with no principal can never reach level 5.
   */
  private assertAutonomy(
    autonomyLevel: number | undefined,
    principal: Principal = UNRESOLVED_PRINCIPAL,
  ): AutonomyResolution {
    return resolveEffectiveAutonomy({ requested: autonomyLevel, principal });
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
  async create(input: CreateBossCommandInput, principal: Principal = UNRESOLVED_PRINCIPAL) {
    if (typeof input.text !== "string" || !input.text.trim()) {
      throw new BadRequestException("text is required");
    }
    const text = input.text.trim();
    if (text.length > BOSS_COMMAND_TEXT_MAX_LENGTH) {
      throw new BadRequestException(`text must be at most ${BOSS_COMMAND_TEXT_MAX_LENGTH} characters`);
    }
    const authority = this.assertAutonomy(input.autonomyLevel, principal);
    const autonomyLevel = authority.effective;

    const command = await this.client.bossCommand.create({
      data: { text, autonomyLevel, status: "received" as BossCommandStatus },
    });
    await this.audit(command.id, "command", command.id, "created", { autonomyLevel });
    // A reduction is never silent: the clamp itself is part of the audit trail.
    if (authority.clamped) {
      await this.audit(command.id, "command", command.id, "autonomy_clamped", {
        requested: authority.requested,
        effective: authority.effective,
        ceiling: authority.ceiling,
        ceilingSource: authority.ceilingSource,
        ownerLevelRefused: authority.ownerLevelRefused,
        principalRole: principal.role,
      });
    }

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
    return this.client.bossCommand.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        plan: { include: { tasks: { include: { actions: true } } } },
        auditLogs: { orderBy: { createdAt: "desc" } },
      },
    });
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

  async update(
    id: string,
    input: Partial<Pick<CreateBossCommandInput, "autonomyLevel"> & { status?: string | null }>,
    principal: Principal = UNRESOLVED_PRINCIPAL,
  ) {
    const existing = await this.get(id);
    // Raising a stored command's autonomy goes through the same server-side
    // ceiling as creating one, otherwise PATCH would be an escalation route.
    const authority =
      input.autonomyLevel !== undefined ? this.assertAutonomy(input.autonomyLevel, principal) : undefined;
    const autonomyLevel = authority?.effective;
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
    if (authority?.clamped) {
      await this.audit(existing.id, "command", existing.id, "autonomy_clamped", {
        requested: authority.requested,
        effective: authority.effective,
        ceiling: authority.ceiling,
        ceilingSource: authority.ceilingSource,
        ownerLevelRefused: authority.ownerLevelRefused,
        principalRole: principal.role,
      });
    }
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