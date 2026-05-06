import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { BlocksModule } from "./blocks/blocks.module";
import { ChatModule } from "./chat/chat.module";
import { DiscoverModule } from "./discover/discover.module";
import { HealthController } from "./health.controller";
import { MatchesModule } from "./matches/matches.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { PrismaModule } from "./prisma.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { ReportsModule } from "./reports/reports.module";
import { RevealModule } from "./reveal/reveal.module";
import { SwipesModule } from "./swipes/swipes.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BlocksModule,
    AuthModule,
    UsersModule,
    OnboardingModule,
    ProfilesModule,
    DiscoverModule,
    SwipesModule,
    MatchesModule,
    ChatModule,
    RevealModule,
    ReportsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
