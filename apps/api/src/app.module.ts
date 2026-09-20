import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { HealthController } from "./health/health.controller";
import { DatabaseModule } from "./db/database.module";
import { OpportunityModule } from "./opportunities/opportunity.module";
import { AffiliateModule } from "./affiliates/affiliate.module";
import { ContentAssetModule } from "./content-assets/content-asset.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ApiKeyGuard } from "./security/api-key.guard";
import { RateLimitGuard } from "./security/rate-limit.guard";

@Module({
  imports: [DatabaseModule, OpportunityModule, AffiliateModule, ContentAssetModule, DashboardModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}