import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RevenueService, RecordRevenueInput, ReconcileRevenueInput } from "./revenue.service";

@Controller("revenue-events")
export class RevenueController {
  constructor(private readonly service: RevenueService) {}

  @Post()
  record(@Body() body: RecordRevenueInput) {
    return this.service.record(body);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post(":id/reconcile")
  reconcile(@Param("id") id: string, @Body() body: ReconcileRevenueInput) {
    return this.service.reconcile(id, body);
  }

  @Post(":id/reject")
  reject(@Param("id") id: string) {
    return this.service.reject(id);
  }
}