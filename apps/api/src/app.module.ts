import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { HealthController } from "./health/health.controller";
import { DatabaseModule } from "./db/database.module";
import { OpportunityModule } from "./opportunities/opportunity.module";
import { AffiliateModule } from "./affiliates/affiliate.module";
import { ContentAssetModule } from "./content-assets/content-asset.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { RevenueModule } from "./revenue/revenue.module";
import { BossModule } from "./boss/boss.module";
import { OpportunityIntelligenceModule } from "./opportunity-intelligence/opportunity-intelligence.module";
import { ContentQaModule } from "./content-qa/content-qa.module";
import { ApiKeyGuard } from "./security/api-key.guard";
import { RateLimitGuard } from "./security/rate-limit.guard";

@Module({
  imports: [
    DatabaseModule,
    OpportunityModule,
    OpportunityIntelligenceModule,
    AffiliateModule,
    ContentAssetModule,
    ContentQaModule,
    DashboardModule,
    RevenueModule,
    BossModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}