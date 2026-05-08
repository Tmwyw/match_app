import {
  BadRequestException,
  ConflictException,
  Injectable,
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
import { PrismaService } from "../prisma.service";

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

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
            desiredPosition: data.desiredPosition,
            trafficSources: data.trafficSources,
            verticals: data.verticals,
            geos: data.geos,
            budgetMin: data.budgetMin,
            budgetMax: data.budgetMax,
            experience: data.experience,
            notes: data.notes ?? null,
          },
        }),
      ]);
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
          offerName: data.offerName,
          trafficSources: data.trafficSources,
          verticals: data.verticals,
          geos: data.geos,
          payoutMin: data.payoutMin,
          payoutMax: data.payoutMax,
          requirements: data.requirements ?? null,
          bio: data.bio ?? null,
        },
      }),
    ]);
    return toMyOwner(created, cleanName);
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
      const [, updated] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: { displayName: nextName },
        }),
        this.prisma.buyerProfile.update({
          where: { userId },
          data: stripUndefined(profileFields),
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
    const [, updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { displayName: nextName },
      }),
      this.prisma.ownerProfile.update({
        where: { userId },
        data: stripUndefined(profileFields),
      }),
    ]);
    return toMyOwner(updated, nextName);
  }
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
