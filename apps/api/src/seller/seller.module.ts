import { Module } from "@nestjs/common";

import { MarketplaceRegistryService } from "./marketplace/marketplace-registry.service";
import { SellerController } from "./seller.controller";
import { SellerService } from "./seller.service";

@Module({
  controllers: [SellerController],
  providers: [SellerService, MarketplaceRegistryService],
  exports: [SellerService, MarketplaceRegistryService],
})
export class SellerModule {}
