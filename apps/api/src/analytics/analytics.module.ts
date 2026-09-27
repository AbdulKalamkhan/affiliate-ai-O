import { Module } from "@nestjs/common";

import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { SellerModule } from "../seller/seller.module";

@Module({
  // SellerModule is imported for the MarketplaceRegistryService, so the
  // analytics engine can tell "no live marketplace" (not_connected) apart from
  // "connected but nothing recorded yet" (known: 0).
  imports: [SellerModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
