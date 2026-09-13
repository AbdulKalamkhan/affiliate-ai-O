import { Module } from "@nestjs/common";
import { ContentAssetController } from "./content-asset.controller";
import { ContentAssetService } from "./content-asset.service";

@Module({
  controllers: [ContentAssetController],
  providers: [ContentAssetService],
  exports: [ContentAssetService],
})
export class ContentAssetModule {}