import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { UsersController } from "./users.controller";

@Module({
  // ChatModule exports both ChatService and ChatGateway, which we need for
  // GET /users/:userId/presence (assertSharedChat + isOnline).
  imports: [AuthModule, ChatModule],
  controllers: [UsersController],
})
export class UsersModule {}
