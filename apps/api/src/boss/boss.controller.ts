import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { BossService, CreateBossCommandInput } from "./boss.service";
import { CurrentPrincipal, type Principal } from "../security/principal";

@Controller("boss/commands")
export class BossController {
  constructor(private readonly service: BossService) {}

  @Post()
  create(@Body() body: CreateBossCommandInput, @CurrentPrincipal() principal: Principal) {
    return this.service.create(body, principal);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: Partial<CreateBossCommandInput & { status?: string | null }>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.service.update(id, body, principal);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
