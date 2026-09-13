import { Module } from "@nestjs/common";
import { AffiliateLinkController } from "./affiliate-link.controller";
import { AffiliateLinkService } from "./affiliate-link.service";
import { MANUAL_PRODUCT_PROVIDER, PRODUCT_DATA_PROVIDER } from "./product-data/product-data.provider";

@Module({
  controllers: [AffiliateLinkController],
  providers: [
    AffiliateLinkService,
    {
      provide: PRODUCT_DATA_PROVIDER,
      useValue: MANUAL_PRODUCT_PROVIDER,
    },
  ],
  exports: [AffiliateLinkService],
})
export class AffiliateModule {}