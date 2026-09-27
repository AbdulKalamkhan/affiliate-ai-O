import { Module } from "@nestjs/common";

import { ContentAssetController } from "./content-asset.controller";
import { ContentAssetService } from "./content-asset.service";
import { ContentQaModule } from "../content-qa/content-qa.module";

@Module({
  // Both QA providers (engine + publish-approval records) come from here, so the
  // publish gate consults approval RECORDS rather than any hardcoded id list.
  imports: [ContentQaModule],
  controllers: [ContentAssetController],
  providers: [ContentAssetService],
  exports: [ContentAssetService],
})
export class ContentAssetModule {}
