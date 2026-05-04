import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";
import { env } from "./env";

async function bootstrap() {
  const corsOrigin = env.WEB_ORIGIN === "*" ? true : env.WEB_ORIGIN;
  const app = await NestFactory.create(AppModule, {
    cors: { origin: corsOrigin, credentials: corsOrigin !== true },
  });
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(env.API_PORT);
  console.log(`[api] listening on http://localhost:${env.API_PORT}`);
}

bootstrap().catch((err) => {
  console.error("[api] failed to bootstrap", err);
  process.exit(1);
});
