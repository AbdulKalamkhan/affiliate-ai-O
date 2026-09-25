import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AddEvidenceInput, OpportunityIntelligenceService } from "./opportunity-intelligence.service";

@Controller("opportunity-intelligence")
export class OpportunityIntelligenceController {
  constructor(private readonly service: OpportunityIntelligenceService) {}

  @Post("opportunities/:id/evidence")
  addEvidence(@Param("id") id: string, @Body() body: AddEvidenceInput) {
    return this.service.addEvidence(id, body);
  }

  @Get("opportunities/:id/evidence")
  listEvidence(@Param("id") id: string) {
    return this.service.listEvidence(id);
  }

  @Get("opportunities/:id/score")
  score(@Param("id") id: string) {
    return this.service.score(id);
  }

  @Get("ranked")
  rank() {
    return this.service.rank();
  }
}