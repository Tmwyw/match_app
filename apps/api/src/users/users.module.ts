import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { SwipesModule } from "../swipes/swipes.module";
import { UsersController } from "./users.controller";

@Module({
  // ChatModule exports ChatService + ChatGateway (presence, sharedChat).
  // SwipesModule exports SwipesService for /me/likes/count.
  // BlocksModule and NotificationsModule are @Global so no explicit import.
  imports: [AuthModule, ChatModule, SwipesModule],
  controllers: [UsersController],
})
export class UsersModule {}
