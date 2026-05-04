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
      return toMyBuyer(p);
    }
    const p = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!p) throw new NotFoundException("NO_PROFILE");
    return toMyOwner(p);
  }

  async createMine(userId: string, body: unknown): Promise<MyProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("user gone");
    if (!user.role) throw new ConflictException("ROLE_NOT_SET");

    if (user.role === "BUYER") {
      const data = parseOrThrow(BuyerProfileInput, body);
      const existing = await this.prisma.buyerProfile.findUnique({ where: { userId } });
      if (existing) throw new ConflictException("PROFILE_ALREADY_EXISTS");
      const created = await this.prisma.buyerProfile.create({
        data: {
          userId,
          verticals: data.verticals,
          geos: data.geos,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          experience: data.experience,
          bio: data.bio ?? null,
        },
      });
      return toMyBuyer(created);
    }

    const data = parseOrThrow(OwnerProfileInput, body);
    const existing = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException("PROFILE_ALREADY_EXISTS");
    const created = await this.prisma.ownerProfile.create({
      data: {
        userId,
        offerName: data.offerName,
        vertical: data.vertical,
        geos: data.geos,
        payoutType: data.payoutType,
        payoutAmount: data.payoutAmount,
        requirements: data.requirements ?? null,
        bio: data.bio ?? null,
      },
    });
    return toMyOwner(created);
  }

  async patchMine(userId: string, body: unknown): Promise<MyProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("user gone");
    if (!user.role) throw new NotFoundException("NO_PROFILE");

    if (user.role === "BUYER") {
      const data = parseOrThrow(BuyerProfilePatch, body);
      const existing = await this.prisma.buyerProfile.findUnique({ where: { userId } });
      if (!existing) throw new NotFoundException("NO_PROFILE");
      const updated = await this.prisma.buyerProfile.update({
        where: { userId },
        data: stripUndefined(data),
      });
      return toMyBuyer(updated);
    }

    const data = parseOrThrow(OwnerProfilePatch, body);
    const existing = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException("NO_PROFILE");
    const updated = await this.prisma.ownerProfile.update({
      where: { userId },
      data: stripUndefined(data),
    });
    return toMyOwner(updated);
  }
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

function toMyBuyer(p: BuyerProfile) {
  return MyBuyerProfile.parse({
    role: "BUYER",
    verticals: p.verticals,
    geos: p.geos,
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    experience: p.experience,
    bio: p.bio,
  });
}

function toMyOwner(p: OwnerProfile) {
  return MyOwnerProfile.parse({
    role: "OWNER",
    offerName: p.offerName,
    vertical: p.vertical,
    geos: p.geos,
    payoutType: p.payoutType,
    payoutAmount: p.payoutAmount,
    requirements: p.requirements,
    bio: p.bio,
  });
}
