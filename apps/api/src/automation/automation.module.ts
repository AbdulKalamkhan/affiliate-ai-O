import { Module } from "@nestjs/common";

import { BossModule } from "../boss/boss.module";
import { AutomationController } from "./automation.controller";
import { AutomationService } from "./automation.service";
import { AutomationWorkerService } from "./automation-worker.service";

@Module({
  // BossModule is imported (never the reverse) so `action.execute` can delegate
  // to the real executor without creating a circular module dependency.
  imports: [BossModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationWorkerService],
  exports: [AutomationService, AutomationWorkerService],
})
export class AutomationModule {}
