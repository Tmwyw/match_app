import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SwipesController } from "./swipes.controller";
import { SwipesService } from "./swipes.service";

@Module({
  imports: [AuthModule],
  controllers: [SwipesController],
  providers: [SwipesService],
})
export class SwipesModule {}
