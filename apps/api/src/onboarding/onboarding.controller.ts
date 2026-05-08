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

  /**
   * Abort onboarding before the user has saved a profile — clears role +
   * anonId so the next /me lands them back on RolePicker. 409 once a
   * BuyerProfile/OwnerProfile row exists (use admin's reset-role then).
   */
  @Delete("role")
  async abortOnboarding(
    @CurrentUser() current: { id: string },
  ): Promise<PublicUser> {
    return this.onboarding.abortOnboarding(current.id);
  }
}
