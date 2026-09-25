import { Controller, Get, Param } from "@nestjs/common";
import { ContentQaService } from "./content-qa.service";

@Controller("content-qa")
export class ContentQaController {
  constructor(private readonly service: ContentQaService) {}

  @Get("assets/:id")
  evaluate(@Param("id") id: string) {
    return this.service.evaluate(id);
  }
}