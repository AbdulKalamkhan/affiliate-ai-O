import { Module } from "@nestjs/common";
import { ContentQaController } from "./content-qa.controller";
import { ContentQaService } from "./content-qa.service";

@Module({
  controllers: [ContentQaController],
  providers: [ContentQaService],
  exports: [ContentQaService],
})
export class ContentQaModule {}