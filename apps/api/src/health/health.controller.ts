import { Controller, Get } from "@nestjs/common";

export interface HealthPayload {
  status: string;
  service: string;
  database: string;
  timestamp: string;
}

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthPayload {
    return {
      status: "ok",
      service: "@ai-os/api",
      database: "not-checked",
      timestamp: new Date().toISOString(),
    };
  }
}