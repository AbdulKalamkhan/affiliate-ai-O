import { Module } from "@nestjs/common";
import { ContentAssetController } from "./content-asset.controller";
import { ContentAssetService } from "./content-asset.service";
import { ContentQaModule } from "../content-qa/content-qa.module";

@Module({
  imports: [ContentQaModule],
  controllers: [ContentAssetController],
  providers: [ContentAssetService],
  exports: [ContentAssetService],
})
export class ContentAssetModule {}