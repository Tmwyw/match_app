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
   * Clear the user's role + anonId IF they haven't completed onboarding yet
   * (no buyer/owner profile row). The user-facing button on the first-time
   * profile form uses this to "go back" to RolePicker. Once a profile row
   * exists, role is locked for end users — admin still has
   * `AdminService.resetUserRole` for the operator-side reset.
   */
  async abortOnboarding(userId: string): Promise<PublicUser> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { buyerProfile: true, ownerProfile: true },
      });
      if (!user) throw new NotFoundException("user gone");
      if (user.buyerProfile || user.ownerProfile) {
        throw new ConflictException("PROFILE_ALREADY_EXISTS");
      }
      if (!user.role) return user; // idempotent — nothing to abort
      return tx.user.update({
        where: { id: user.id },
        data: { role: null, anonId: null, displayName: null },
      });
    });
    return toPublicUser(updated);
  }
}
