import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the long-poll process. We use it ONLY to
 * persist deep-link side-effects from /start (pending profile-view,
 * referral attribution). Heavy queries belong in the API process.
 */
export const prisma = new PrismaClient();
