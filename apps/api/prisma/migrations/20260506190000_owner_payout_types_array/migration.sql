-- OwnerProfile.payoutType (single string) → payoutTypes (string array).
-- Existing rows: wrap their single value into a one-element array so we
-- don't lose data already entered by test users.

ALTER TABLE "OwnerProfile" ADD COLUMN "payoutTypes" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "OwnerProfile"
SET "payoutTypes" = ARRAY["payoutType"]
WHERE "payoutType" IS NOT NULL;

ALTER TABLE "OwnerProfile" DROP COLUMN "payoutType";
ALTER TABLE "OwnerProfile" ALTER COLUMN "payoutTypes" DROP DEFAULT;
