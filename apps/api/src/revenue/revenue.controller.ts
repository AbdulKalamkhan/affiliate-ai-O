import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RevenueService, RecordRevenueInput, ReconcileRevenueInput } from "./revenue.service";
import { CurrentPrincipal, type Principal } from "../security/principal";

@Controller("revenue-events")
export class RevenueController {
  constructor(private readonly service: RevenueService) {}

  /**
   * The audit `actor` is taken from the AUTHENTICATED principal, never from the
   * body. A body-supplied `actor` used to be trusted, which meant any caller
   * holding the deployment API key could write an audit row naming someone else
   * (including "owner") on a money write. The body value is now overwritten.
   */
  @Post()
  record(@Body() body: RecordRevenueInput, @CurrentPrincipal() principal: Principal) {
    return this.service.record({ ...body, actor: principal.id });
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get("concentration")
  concentration() {
    return this.service.concentration();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post(":id/reconcile")
  reconcile(
    @Param("id") id: string,
    @Body() body: ReconcileRevenueInput,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.service.reconcile(id, { ...body, actor: principal.id });
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @CurrentPrincipal() principal: Principal) {
    return this.service.reject(id, principal.id);
  }
}