import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import type { PublicUser } from "@tg-app-meet/shared";
import { toPublicUser } from "../auth/public-user";
import { PrismaService } from "../prisma.service";

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async assignRole(userId: string, role: Role): Promise<PublicUser> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException("user gone");

      if (user.role === role) return user;
      if (user.role && user.role !== role) {
        throw new ConflictException("ROLE_ALREADY_SET");
      }

      const counter = await tx.anonCounter.upsert({
        where: { role },
        create: { role, next: 2 },
        update: { next: { increment: 1 } },
      });
      const assigned = counter.next - 1;
      const anonId = `${role === "BUYER" ? "Buyer" : "Owner"} #${assigned}`;

      return tx.user.update({
        where: { id: userId },
        data: { role, anonId },
      });
    });

    return toPublicUser(updated);
  }

  /**
   * Clear the user's role + anonId and delete their per-role profile so they
   * land back in onboarding (RolePicker → profile form). Existing matches /
   * swipes / messages remain intact — chat partners will see the user's
   * anonId change once a new role is picked (anonId is joined fresh from
   * User on every message read; no schema-level snapshot to update).
   */
  async resetRole(userId: string): Promise<PublicUser> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException("user gone");
      if (!user.role) return user; // already cleared — idempotent

      await tx.buyerProfile.deleteMany({ where: { userId } });
      await tx.ownerProfile.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: { role: null, anonId: null },
      });
    });
    return toPublicUser(updated);
  }
}
