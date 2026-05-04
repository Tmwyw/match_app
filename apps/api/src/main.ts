import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env } from "./env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: env.WEB_ORIGIN, credentials: true } });
  await app.listen(env.API_PORT);
  console.log(`[api] listening on http://localhost:${env.API_PORT}`);
}

bootstrap().catch((err) => {
  console.error("[api] failed to bootstrap", err);
  process.exit(1);
});
