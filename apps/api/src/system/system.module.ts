import { Module } from "@nestjs/common";
import { SystemController } from "./system.controller";
import { ProviderRegistryService } from "../providers/provider-registry.service";

@Module({
  controllers: [SystemController],
  providers: [ProviderRegistryService],
})
export class SystemModule {}