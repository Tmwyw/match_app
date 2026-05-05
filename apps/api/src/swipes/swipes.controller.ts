import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { SwipeRequest, type SwipeResponse } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RateLimitGuard } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SwipesService } from "./swipes.service";

@Controller("swipes")
@UseGuards(JwtAuthGuard, RateLimitGuard("swipes", 30, 60_000))
export class SwipesController {
  constructor(private readonly swipes: SwipesService) {}

  @Post()
  async swipe(
    @CurrentUser() current: { id: string },
    @Body(new ZodValidationPipe(SwipeRequest)) body: SwipeRequest,
  ): Promise<SwipeResponse> {
    return this.swipes.swipe(current.id, body);
  }
}
