import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { RevealController } from "./reveal.controller";
import { RevealService } from "./reveal.service";

@Module({
  imports: [AuthModule, ChatModule],
  controllers: [RevealController],
  providers: [RevealService],
})
export class RevealModule {}
