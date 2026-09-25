import { Injectable } from "@nestjs/common";
import { providerRegistryStatus } from "./provider-adapter";

// Read-only, value-free status reporting for the registered provider adapters.
// `configured` is presence-of-env-var-name only (ACC-02: never record values).
@Injectable()
export class ProviderRegistryService {
  status(): ReturnType<typeof providerRegistryStatus> {
    return providerRegistryStatus();
  }
}