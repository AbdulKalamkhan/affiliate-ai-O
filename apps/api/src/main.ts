import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`AI_OS API listening on http://localhost:${port}`);
}

void bootstrap();