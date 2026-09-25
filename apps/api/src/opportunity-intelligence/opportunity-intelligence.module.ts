import { Module } from "@nestjs/common";
import { OpportunityIntelligenceController } from "./opportunity-intelligence.controller";
import { OpportunityIntelligenceService } from "./opportunity-intelligence.service";

@Module({
  controllers: [OpportunityIntelligenceController],
  providers: [OpportunityIntelligenceService],
  exports: [OpportunityIntelligenceService],
})
export class OpportunityIntelligenceModule {}