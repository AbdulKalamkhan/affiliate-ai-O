import { Module } from "@nestjs/common";

import { BossApprovalService } from "./boss-approval.service";
import { BossController } from "./boss.controller";
import { BossExecutionController } from "./boss-execution.controller";
import { BossExecutorService } from "./boss-executor.service";
import { BossMemoryService } from "./boss-memory.service";
import { BossService } from "./boss.service";

@Module({
  controllers: [BossController, BossExecutionController],
  providers: [BossService, BossExecutorService, BossApprovalService, BossMemoryService],
  exports: [BossService, BossExecutorService, BossApprovalService, BossMemoryService],
})
export class BossModule {}
