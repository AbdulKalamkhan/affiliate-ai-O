import { Module } from "@nestjs/common";

import { BossApprovalService } from "./boss-approval.service";
import { BossController } from "./boss.controller";
import { BossExecutionController } from "./boss-execution.controller";
import { BossExecutorService } from "./boss-executor.service";
import { BossMemoryService } from "./boss-memory.service";
import { BOSS_MEMORY_READER, DbBossMemoryReader } from "./boss-memory-reader";
import { BossService } from "./boss.service";

@Module({
  controllers: [BossController, BossExecutionController],
  providers: [
    BossService,
    BossExecutorService,
    BossApprovalService,
    BossMemoryService,
    // Plan-time memory access is READ-ONLY and narrow: the generator depends on
    // BossMemoryReader only, never on DbClient directly.
    DbBossMemoryReader,
    { provide: BOSS_MEMORY_READER, useExisting: DbBossMemoryReader },
  ],
  exports: [BossService, BossExecutorService, BossApprovalService, BossMemoryService, BOSS_MEMORY_READER],
})
export class BossModule {}
