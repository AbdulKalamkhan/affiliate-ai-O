import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { CurrentPrincipal, type Principal } from "../security/principal";
import { BossApprovalService } from "./boss-approval.service";
import { BossExecutorService } from "./boss-executor.service";
import { BossMemoryService } from "./boss-memory.service";
import { listToolDefinitions } from "./boss-tool-registry";

/**
 * Phase-01A executor boundary + approvals + tool inventory.
 *
 * Auth: every route here sits behind the global fail-closed API key guard.
 * Execution additionally refuses to run external-side-effect tools without an
 * explicit, unexpired Owner approval (enforced in the policy layer, not here).
 */
@Controller("boss")
export class BossExecutionController {
  constructor(
    private readonly executor: BossExecutorService,
    private readonly approvals: BossApprovalService,
    private readonly memory: BossMemoryService,
  ) {}

  @Get("tools")
  tools() {
    return {
      tools: listToolDefinitions(),
      externalApprovalRequired: true,
      note: "Tools marked not_implemented have no handler; they can never report success.",
    };
  }

  @Get("actions")
  listActions(@Query("commandId") commandId?: string, @Query("status") status?: string) {
    return this.executor.listActions({ commandId, status });
  }

  @Get("actions/executable")
  executable() {
    return this.executor.executable();
  }

  @Get("actions/:id")
  getAction(@Param("id") id: string) {
    return this.executor.getAction(id);
  }

  @Post("actions/:id/execute")
  execute(@Param("id") id: string) {
    return this.executor.executeAction(id);
  }

  @Get("tool-calls")
  toolCalls() {
    return this.executor.listToolCalls();
  }

  @Get("approvals")
  listApprovals(@Query("status") status?: string) {
    return this.approvals.list(status);
  }

  @Get("approvals/:id")
  getApproval(@Param("id") id: string) {
    return this.approvals.get(id);
  }

  @Post("approvals/:id/approve")
  approve(
    @Param("id") id: string,
    // `decidedBy` is taken from the AUTHENTICATED principal, never from the body,
    // so an approval cannot be attributed to someone who did not make it.
    @CurrentPrincipal() principal: Principal,
    @Body() body: { note?: string } = {},
  ) {
    return this.approvals.decide(id, "approved", {
      note: body?.note,
      decidedBy: principal.id,
    });
  }

  @Post("approvals/:id/reject")
  reject(
    @Param("id") id: string,
    @CurrentPrincipal() principal: Principal,
    @Body() body: { note?: string } = {},
  ) {
    return this.approvals.decide(id, "rejected", {
      note: body?.note,
      decidedBy: principal.id,
    });
  }

  @Post("actions/:id/request-approval")
  requestApproval(@Param("id") id: string, @Body() body: { reason?: string } = {}) {
    return this.approvals.requestForAction(id, body?.reason);
  }

  // ------------------------------------------------------------- AI memory

  @Get("memory")
  listMemory(@Query("kind") kind?: string) {
    return this.memory.list(kind);
  }

  @Post("memory")
  remember(
    @Body()
    body: {
      key: string;
      kind: "fact" | "pattern" | "lesson" | "constraint";
      value: unknown;
      weight?: number;
      confidence?: number;
      source?: string;
      tags?: string[];
    },
  ) {
    return this.memory.remember({ ...body, value: body.value as never });
  }

  @Get("decisions")
  listDecisions() {
    return this.memory.listDecisions();
  }

  @Post("decisions")
  recordDecision(
    @Body()
    body: { commandId?: string; decision: string; rationale: string; factors?: unknown; confidence?: number },
  ) {
    return this.memory.recordDecision({
      ...(body.commandId ? { commandId: body.commandId } : {}),
      decision: body.decision,
      rationale: body.rationale,
      ...(body.factors !== undefined ? { factors: body.factors as never } : {}),
      ...(body.confidence !== undefined ? { confidence: body.confidence } : {}),
    });
  }

  @Post("decisions/:id/outcome")
  recordOutcome(
    @Param("id") id: string,
    @Body() body: { actual: string; success: boolean; lesson?: string; tags?: string[] },
  ) {
    return this.memory.recordOutcome({
      decisionId: id,
      actual: body.actual,
      success: body.success,
      ...(body.lesson ? { lesson: body.lesson } : {}),
      ...(body.tags ? { tags: body.tags } : {}),
    });
  }

  @Get("lessons")
  listLessons(@Query("limit") limit?: string) {
    const parsed = limit ? Number(limit) : 50;
    return this.memory.listLessons(Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50);
  }

  @Get("learning")
  learning() {
    return this.memory.learningEvidence();
  }

  @Get("recommendations")
  recommendations() {
    return this.memory.recommendations();
  }

  @Get("capability")
  capability() {
    return this.memory.capability();
  }
}
