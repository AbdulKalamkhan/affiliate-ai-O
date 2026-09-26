import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { CurrentPrincipal, type Principal } from "../security/principal";
import { ContentQaService } from "./content-qa.service";
import { PublishApprovalService } from "./publish-approval.service";

@Controller("content-qa")
export class ContentQaController {
  constructor(
    private readonly service: ContentQaService,
    private readonly approvals: PublishApprovalService,
  ) {}

  @Get("assets/:id")
  evaluate(@Param("id") id: string) {
    return this.service.evaluate(id);
  }

  /** Publish approvals — the auditable replacement for the old hardcoded bypass. */
  @Get("approvals")
  listApprovals() {
    return this.approvals.list();
  }

  @Post("approvals")
  grantApproval(
    // The approver is the AUTHENTICATED principal, never a value from the body,
    // so an approval can never be attributed to someone who did not grant it.
    @CurrentPrincipal() principal: Principal,
    @Body() body: { assetId: string; reason: string; evidence?: unknown },
  ) {
    return this.approvals.grant({
      assetId: body.assetId,
      approvedBy: principal.id,
      reason: body.reason,
      ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
    });
  }
}
