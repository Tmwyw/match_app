import { Body, Controller, Delete, Post, UseGuards } from "@nestjs/common";
import { PickRoleRequest, type PublicUser } from "@tg-app-meet/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post("role")
  async pickRole(
    @CurrentUser() current: { id: string },
    @Body(new ZodValidationPipe(PickRoleRequest)) body: PickRoleRequest,
  ): Promise<PublicUser> {
    return this.onboarding.assignRole(current.id, body.role);
  }

  @Delete("role")
  async resetRole(@CurrentUser() current: { id: string }): Promise<PublicUser> {
    return this.onboarding.resetRole(current.id);
  }
}
