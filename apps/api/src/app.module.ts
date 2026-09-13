import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DatabaseModule } from "./db/database.module";
import { OpportunityModule } from "./opportunities/opportunity.module";
import { AffiliateModule } from "./affiliates/affiliate.module";

@Module({
  imports: [DatabaseModule, OpportunityModule, AffiliateModule],
  controllers: [HealthController],
})
export class AppModule {}