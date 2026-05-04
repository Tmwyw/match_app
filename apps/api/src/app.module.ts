import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { PrismaModule } from "./prisma.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, OnboardingModule, ProfilesModule],
  controllers: [HealthController],
})
export class AppModule {}
