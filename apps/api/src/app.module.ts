import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { DiscoverModule } from "./discover/discover.module";
import { HealthController } from "./health.controller";
import { MatchesModule } from "./matches/matches.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { PrismaModule } from "./prisma.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { SwipesModule } from "./swipes/swipes.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    OnboardingModule,
    ProfilesModule,
    DiscoverModule,
    SwipesModule,
    MatchesModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
