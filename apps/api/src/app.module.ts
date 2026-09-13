import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DatabaseModule } from "./db/database.module";
import { OpportunityModule } from "./opportunities/opportunity.module";
import { AffiliateModule } from "./affiliates/affiliate.module";
import { ContentAssetModule } from "./content-assets/content-asset.module";
import { DashboardModule } from "./dashboard/dashboard.module";

@Module({
  imports: [DatabaseModule, OpportunityModule, AffiliateModule, ContentAssetModule, DashboardModule],
  controllers: [HealthController],
})
export class AppModule {}