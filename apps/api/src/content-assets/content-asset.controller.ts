import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  ContentAssetService,
  CreateContentAssetInput,
  UpdateContentAssetInput,
} from "./content-asset.service";

@Controller("content-assets")
export class ContentAssetController {
  constructor(private readonly service: ContentAssetService) {}

  @Post()
  create(@Body() body: CreateContentAssetInput) {
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
  update(@Param("id") id: string, @Body() body: UpdateContentAssetInput) {
    return this.service.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}