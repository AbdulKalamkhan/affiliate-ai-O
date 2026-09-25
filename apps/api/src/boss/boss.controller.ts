import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { BossService, CreateBossCommandInput } from "./boss.service";

@Controller("boss/commands")
export class BossController {
  constructor(private readonly service: BossService) {}

  @Post()
  create(@Body() body: CreateBossCommandInput) {
    return this.service.create(body);
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
  update(@Param("id") id: string, @Body() body: Partial<CreateBossCommandInput & { status?: string | null }>) {
    return this.service.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}