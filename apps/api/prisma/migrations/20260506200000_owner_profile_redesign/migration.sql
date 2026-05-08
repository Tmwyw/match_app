-- OwnerProfile redesign:
--   vertical (single)         → trafficSources (array, "Источник трафика")
--   payoutTypes / payoutAmount → payoutMin + payoutMax
--   add verticals (array)     — new "Вертикаль" (Gambling/Crypto/...)
--
-- Existing rows: copy old vertical into trafficSources, copy old
-- payoutAmount into both min+max so values aren't lost.

ALTER TABLE "OwnerProfile" ADD COLUMN "trafficSources" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "OwnerProfile" ADD COLUMN "verticals" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "OwnerProfile" ADD COLUMN "payoutMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OwnerProfile" ADD COLUMN "payoutMax" INTEGER NOT NULL DEFAULT 0;

UPDATE "OwnerProfile"
SET "trafficSources" = ARRAY["vertical"]
WHERE "vertical" IS NOT NULL AND "vertical" <> '';

UPDATE "OwnerProfile"
SET "payoutMin" = "payoutAmount", "payoutMax" = "payoutAmount";

ALTER TABLE "OwnerProfile" DROP COLUMN "vertical";
ALTER TABLE "OwnerProfile" DROP COLUMN "payoutAmount";
ALTER TABLE "OwnerProfile" DROP COLUMN "payoutTypes";

ALTER TABLE "OwnerProfile" ALTER COLUMN "trafficSources" DROP DEFAULT;
ALTER TABLE "OwnerProfile" ALTER COLUMN "verticals" DROP DEFAULT;
ALTER TABLE "OwnerProfile" ALTER COLUMN "payoutMin" DROP DEFAULT;
ALTER TABLE "OwnerProfile" ALTER COLUMN "payoutMax" DROP DEFAULT;
