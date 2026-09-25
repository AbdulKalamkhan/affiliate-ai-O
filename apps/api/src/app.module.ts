import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { APP_FILTER } from "@nestjs/core";
import { APP_INTERCEPTOR } from "@nestjs/core";
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
import { CampaignAnalyticsModule } from "./campaign-analytics/campaign-analytics.module";
import { SystemModule } from "./system/system.module";
import { ApiKeyGuard } from "./security/api-key.guard";
import { RateLimitGuard } from "./security/rate-limit.guard";
import { AllExceptionsFilter } from "./observability/http-exception.filter";
import { RequestLoggerInterceptor } from "./observability/request-logger.interceptor";

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
    CampaignAnalyticsModule,
    SystemModule,
    BossModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
  ],
})
export class AppModule {}