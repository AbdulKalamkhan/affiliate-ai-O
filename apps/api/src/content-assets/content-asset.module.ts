import { Module } from "@nestjs/common";

import { ContentAssetController } from "./content-asset.controller";
import { ContentAssetService } from "./content-asset.service";
import { ContentQaModule } from "../content-qa/content-qa.module";

@Module({
  // ContentQaModule is imported for the ContentQaService side of the QA gate;
  // the publish-approval service is reached through the module's own provider,
  // so the gate consults approval RECORDS rather than any hardcoded id list.
  imports: [ContentQaModule],
  controllers: [ContentAssetController],
  providers: [ContentAssetService],
  exports: [ContentAssetService],
})
export class ContentAssetModule {}
