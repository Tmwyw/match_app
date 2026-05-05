import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SwipesController } from "./swipes.controller";
import { SwipesService } from "./swipes.service";

@Module({
  imports: [AuthModule],
  controllers: [SwipesController],
  providers: [SwipesService],
  // Exported so UsersController can call inboundLikesCount() for /me/likes/count.
  exports: [SwipesService],
})
export class SwipesModule {}
