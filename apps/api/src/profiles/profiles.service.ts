import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { BuyerProfile, OwnerProfile } from "@prisma/client";
import {
  BuyerProfileInput,
  BuyerProfilePatch,
  MyBuyerProfile,
  MyOwnerProfile,
  type MyProfileResponse,
  OwnerProfileInput,
  OwnerProfilePatch,
} from "@tg-app-meet/shared";
import type { ZodSchema } from "zod";
import { antiDeanon } from "../chat/anti-deanon";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getMine(userId: string): Promise<MyProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("user gone");
    if (!user.role) throw new NotFoundException("NO_PROFILE");

    if (user.role === "BUYER") {
      const p = await this.prisma.buyerProfile.findUnique({ where: { userId } });
      if (!p) throw new NotFoundException("NO_PROFILE");
      return toMyBuyer(p, user.displayName);
    }
    const p = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!p) throw new NotFoundException("NO_PROFILE");
    return toMyOwner(p, user.displayName);
  }

  async createMine(userId: string, body: unknown): Promise<MyProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("user gone");
    if (!user.role) throw new ConflictException("ROLE_NOT_SET");

    if (user.role === "BUYER") {
      const data = parseOrThrow(BuyerProfileInput, body);
      const existing = await this.prisma.buyerProfile.findUnique({ where: { userId } });
      if (existing) throw new ConflictException("PROFILE_ALREADY_EXISTS");
      const cleanName = scrubDisplayName(data.displayName);
      const [, created] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: { displayName: cleanName },
        }),
        this.prisma.buyerProfile.create({
          data: {
            userId,
            desiredPosition: scrubText(data.desiredPosition, 100) ?? "",
            trafficSources: scrubTags(data.trafficSources),
            verticals: scrubTags(data.verticals),
            geos: scrubTags(data.geos),
            budgetMin: data.budgetMin,
            budgetMax: data.budgetMax,
            experience: data.experience,
            notes: scrubText(data.notes, 100),
          },
        }),
      ]);
      void this.notifyAdmins(user.anonId, "BUYER");
      return toMyBuyer(created, cleanName);
    }

    const data = parseOrThrow(OwnerProfileInput, body);
    const existing = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException("PROFILE_ALREADY_EXISTS");
    const cleanName = scrubDisplayName(data.displayName);
    const [, created] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { displayName: cleanName },
      }),
      this.prisma.ownerProfile.create({
        data: {
          userId,
          offerName: scrubText(data.offerName, 100) ?? "",
          trafficSources: scrubTags(data.trafficSources),
          verticals: scrubTags(data.verticals),
          geos: scrubTags(data.geos),
          payoutMin: data.payoutMin,
          payoutMax: data.payoutMax,
          requirements: scrubText(data.requirements, 100),
          bio: scrubText(data.bio, 100),
        },
      }),
    ]);
    void this.notifyAdmins(user.anonId, "OWNER");
    return toMyOwner(created, cleanName);
  }

  /**
   * Fan-out a "new submission" DM to every admin so they don't have to
   * poll the moderation queue manually. Fire-and-forget — anonId is
   * already populated by onboarding's role-pick step before any profile
   * can be saved, so it's never null here in practice.
   */
  private notifyAdmins(
    anonId: string | null,
    role: "BUYER" | "OWNER",
  ): Promise<void> {
    this.logger.log(
      `createMine → notifyAdmins anonId=${anonId} role=${role}`,
    );
    if (!anonId) {
      this.logger.warn(
        "createMine → notifyAdmins SKIP: anonId is null (shouldn't happen post-onboarding)",
      );
      return Promise.resolve();
    }
    return this.notifications
      .notifyAdminsNewSubmission({ anonId, role })
      .catch(() => {
        /* notifications service already logs */
      });
  }

  async patchMine(userId: string, body: unknown): Promise<MyProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("user gone");
    if (!user.role) throw new NotFoundException("NO_PROFILE");

    if (user.role === "BUYER") {
      const data = parseOrThrow(BuyerProfilePatch, body);
      const existing = await this.prisma.buyerProfile.findUnique({ where: { userId } });
      if (!existing) throw new NotFoundException("NO_PROFILE");

      const { displayName: nameRaw, ...profileFields } = data;
      const nextName =
        nameRaw === undefined ? user.displayName : scrubDisplayName(nameRaw);
      const scrubbed = scrubBuyerPatch(profileFields);
      const [, updated] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: { displayName: nextName },
        }),
        this.prisma.buyerProfile.update({
          where: { userId },
          data: stripUndefined(scrubbed),
        }),
      ]);
      return toMyBuyer(updated, nextName);
    }

    const data = parseOrThrow(OwnerProfilePatch, body);
    const existing = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException("NO_PROFILE");

    const { displayName: nameRaw, ...profileFields } = data;
    const nextName =
      nameRaw === undefined ? user.displayName : scrubDisplayName(nameRaw);
    const scrubbed = scrubOwnerPatch(profileFields);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { displayName: nextName },
      }),
      this.prisma.ownerProfile.update({
        where: { userId },
        data: stripUndefined(scrubbed),
      }),
    ]);
    return toMyOwner(updated, nextName);
  }
}

/**
 * Run anti-deanon over a free-form text field. Replaces matched contacts
 * with `[скрыто]` markers in-place (so the user sees what was caught).
 * Returns null for empty/whitespace input. Optional `max` clips length
 * after scrubbing — useful for fields with a UI char limit.
 */
function scrubText(
  input: string | null | undefined,
  max?: number,
): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const { content } = antiDeanon(trimmed);
  const out = content.trim();
  if (out.length === 0) return null;
  return max ? out.slice(0, max) : out;
}

/** Filter array of user-supplied tags. Tags that trip anti-deanon (a user
 *  trying to slip `@username` into the trafficSources array, etc.) are
 *  dropped entirely — keeping a `[скрыто]` chip on the profile would be
 *  ugly and confusing. */
function scrubTags(tags: readonly string[]): string[] {
  return tags
    .map((t) => ({ raw: t, result: antiDeanon(t.trim()) }))
    .filter(({ result }) => !result.filtered && result.content.length > 0)
    .map(({ raw }) => raw.trim());
}

function scrubBuyerPatch(
  patch: Partial<{
    desiredPosition: string;
    trafficSources: string[];
    verticals: string[];
    geos: string[];
    budgetMin: number;
    budgetMax: number;
    experience: number;
    notes: string | null | undefined;
  }>,
): typeof patch {
  return {
    ...patch,
    ...(patch.desiredPosition !== undefined
      ? { desiredPosition: scrubText(patch.desiredPosition, 100) ?? "" }
      : {}),
    ...(patch.trafficSources !== undefined
      ? { trafficSources: scrubTags(patch.trafficSources) }
      : {}),
    ...(patch.verticals !== undefined
      ? { verticals: scrubTags(patch.verticals) }
      : {}),
    ...(patch.geos !== undefined ? { geos: scrubTags(patch.geos) } : {}),
    ...(patch.notes !== undefined
      ? { notes: scrubText(patch.notes, 100) }
      : {}),
  };
}

function scrubOwnerPatch(
  patch: Partial<{
    offerName: string;
    trafficSources: string[];
    verticals: string[];
    geos: string[];
    payoutMin: number;
    payoutMax: number;
    requirements: string | null | undefined;
    bio: string | null | undefined;
  }>,
): typeof patch {
  return {
    ...patch,
    ...(patch.offerName !== undefined
      ? { offerName: scrubText(patch.offerName, 100) ?? "" }
      : {}),
    ...(patch.trafficSources !== undefined
      ? { trafficSources: scrubTags(patch.trafficSources) }
      : {}),
    ...(patch.verticals !== undefined
      ? { verticals: scrubTags(patch.verticals) }
      : {}),
    ...(patch.geos !== undefined ? { geos: scrubTags(patch.geos) } : {}),
    ...(patch.requirements !== undefined
      ? { requirements: scrubText(patch.requirements, 100) }
      : {}),
    ...(patch.bio !== undefined ? { bio: scrubText(patch.bio, 100) } : {}),
  };
}

/**
 * Run the chat anti-deanon scrub on the user-chosen nickname so users can't
 * leak `@tg_handle` / `t.me/...` / phones / emails through their display
 * name. Returns null for empty/whitespace-only input so `displayName ??
 * anonId` falls back cleanly. If the entire string was scrubbed we also
 * return null (don't store "[скрыто]" as a name).
 */
function scrubDisplayName(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const { content } = antiDeanon(trimmed);
  const cleaned = content.replace(/\[скрыто\]/g, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 32) : null;
}

function parseOrThrow<T>(schema: ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new BadRequestException({
      message: "Invalid request body",
      issues: r.error.flatten(),
    });
  }
  return r.data;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

function toMyBuyer(p: BuyerProfile, displayName: string | null) {
  return MyBuyerProfile.parse({
    role: "BUYER",
    displayName,
    desiredPosition: p.desiredPosition,
    trafficSources: p.trafficSources,
    verticals: p.verticals,
    geos: p.geos,
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    experience: p.experience,
    notes: p.notes,
  });
}

function toMyOwner(p: OwnerProfile, displayName: string | null) {
  return MyOwnerProfile.parse({
    role: "OWNER",
    displayName,
    offerName: p.offerName,
    trafficSources: p.trafficSources,
    verticals: p.verticals,
    geos: p.geos,
    payoutMin: p.payoutMin,
    payoutMax: p.payoutMax,
    requirements: p.requirements,
    bio: p.bio,
  });
}
