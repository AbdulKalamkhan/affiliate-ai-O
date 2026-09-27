import { Global, Module } from "@nestjs/common";

import { AiController } from "./ai.controller";
import { AiProviderRegistry, buildDefaultRegistry } from "./ai-provider.registry";
import { AiService } from "./ai.service";

/**
 * Global so any module (Boss, automation, future engines) can reach the AI
 * boundary without re-importing a module list. The registry is provided as a
 * FACTORY so the adapter set is assembled in exactly one place — providing the
 * class directly would hand every consumer an EMPTY registry, which fails closed
 * for the wrong reason (nothing registered) instead of the right one (no
 * credential).
 */
@Global()
@Module({
  controllers: [AiController],
  providers: [
    { provide: AiProviderRegistry, useFactory: () => buildDefaultRegistry() },
    AiService,
  ],
  exports: [AiService, AiProviderRegistry],
})
export class AiModule {}
