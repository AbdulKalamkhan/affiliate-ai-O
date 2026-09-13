import { Global, Module } from "@nestjs/common";
import { prisma } from "@ai-os/database";
import { DB_CLIENT } from "./tokens";

@Global()
@Module({
  providers: [{ provide: DB_CLIENT, useValue: prisma }],
  exports: [DB_CLIENT],
})
export class DatabaseModule {}