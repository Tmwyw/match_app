import { z } from "zod";

export const Role = z.enum(["BUYER", "OWNER"]);
export type Role = z.infer<typeof Role>;

export const Vertical = z.enum([
  "FB",
  "GOOGLE",
  "TIKTOK",
  "PUSH",
  "POPS",
  "NATIVE",
  "INFLUENCER",
  "SEO",
  "OTHER",
]);
export type Vertical = z.infer<typeof Vertical>;

export const Geo = z.enum([
  "TIER1",
  "TIER2",
  "TIER3",
  "RU",
  "CIS",
  "EU",
  "LATAM",
  "ASIA",
  "MENA",
  "AFRICA",
]);
export type Geo = z.infer<typeof Geo>;

export const PayoutType = z.enum(["CPA", "REVSHARE", "HYBRID"]);
export type PayoutType = z.infer<typeof PayoutType>;
