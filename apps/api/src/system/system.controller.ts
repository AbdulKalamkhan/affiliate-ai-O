import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ProviderRegistryService } from "../providers/provider-registry.service";

@Controller("system")
export class SystemController {
  constructor(private readonly registry: ProviderRegistryService) {}

  @Get("providers")
  listProviders() {
    const list = this.registry.status();
    return {
      at: new Date().toISOString(),
      configuredCount: list.filter((p) => p.configured).length,
      registeredCount: list.length,
      providers: list,
    };
  }

  @Get("providers/:name")
  provider(@Param("name") name: string) {
    const found = this.registry.status().find((p) => p.name === name);
    if (!found) {
      throw new NotFoundException(`provider adapter ${name} not found`);
    }
    return found;
  }
}