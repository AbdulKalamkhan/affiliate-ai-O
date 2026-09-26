import { Injectable, Module, type OnApplicationBootstrap } from "@nestjs/common";

import { ContentAssetModule } from "../content-assets/content-asset.module";
import { ContentQaController } from "./content-qa.controller";
import { ContentQaService } from "./content-qa.service";
import { PublishApprovalService } from "./publish-approval.service";

/**
 * Runs the one-time, idempotent migration of the old hardcoded publish bypass
 * into real approval records. Already-migrated ids are skipped, so repeated boots
 * (and multiple replicas) converge to the same state and never duplicate a row.
 */
@Injectable()
class LegacyPublishApprovalMigration implements OnApplicationBootstrap {
  constructor(private readonly approvals: PublishApprovalService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const { migrated, skipped } = await this.approvals.migrateLegacyApprovals();
      if (migrated.length > 0) {
        console.log(`[content-qa] migrated legacy publish approvals: ${migrated.join(", ")}`);
      }
      if (skipped.length > 0) {
        console.log(`[content-qa] publish approvals already present: ${skipped.join(", ")}`);
      }
    } catch (error) {
      // Loud but non-fatal: the gate still protects every unapproved publish, so a
      // missing legacy row can only ever be more restrictive, never unsafe.
      console.error("[content-qa] legacy publish approval migration failed", error);
    }
  }
}

@Module({
  imports: [ContentAssetModule],
  controllers: [ContentQaController],
  providers: [ContentQaService, PublishApprovalService, LegacyPublishApprovalMigration],
  exports: [ContentQaService, PublishApprovalService],
})
export class ContentQaModule {}
