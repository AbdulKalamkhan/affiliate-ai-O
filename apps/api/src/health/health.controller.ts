import { Controller, Get, Inject } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import { DB_CLIENT } from "../db/tokens";
import { Public } from "../security/public.decorator";

export interface HealthPayload {
  status: string;
  service: string;
  database: string;
  timestamp: string;
}

type DbProbe = { $queryRawUnsafe: (query: string) => Promise<unknown> };

@Controller("health")
export class HealthController {
  constructor(@Inject(DB_CLIENT) private readonly client: DbProbe = prisma as DbProbe) {}

  @Public()
  @Get()
  async getHealth(): Promise<HealthPayload> {
    let database = "ok";
    try {
      await this.client.$queryRawUnsafe("SELECT 1");
    } catch {
      database = "error";
    }
    return {
      status: database === "ok" ? "ok" : "degraded",
      service: "@ai-os/api",
      database,
      timestamp: new Date().toISOString(),
    };
  }
}