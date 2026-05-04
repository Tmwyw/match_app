import { Body, Controller, HttpCode, Post, UsePipes } from "@nestjs/common";
import { AuthRequest, type AuthResponse } from "@tg-app-meet/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("telegram")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(AuthRequest))
  async loginWithTelegram(@Body() body: AuthRequest): Promise<AuthResponse> {
    return this.auth.authenticateWithInitData(body.initData);
  }
}
