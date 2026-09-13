import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { OpportunityService, CreateOpportunityInput } from "./opportunity.service";

@Controller("opportunities")
export class OpportunityController {
  constructor(private readonly service: OpportunityService) {}

  @Post()
  create(@Body() body: CreateOpportunityInput) {
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
  update(@Param("id") id: string, @Body() body: Partial<CreateOpportunityInput>) {
    return this.service.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}