-- BuyerProfile redesign:
--   verticals (was "Источники")  → trafficSources (now "Источник трафика")
--   add verticals (industry: Gambling/Crypto/...)
--   add desiredPosition ("интересующая вакансия")
--   bio                            → notes ("Дополнительно")

ALTER TABLE "BuyerProfile" RENAME COLUMN "verticals" TO "trafficSources";

ALTER TABLE "BuyerProfile" ADD COLUMN "verticals" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "BuyerProfile" ADD COLUMN "desiredPosition" TEXT NOT NULL DEFAULT '';

ALTER TABLE "BuyerProfile" RENAME COLUMN "bio" TO "notes";

ALTER TABLE "BuyerProfile" ALTER COLUMN "verticals" DROP DEFAULT;
-- desiredPosition keeps its '' default so newly-created rows from raw SQL
-- (admin tools, fixtures) don't fail; the application form requires a real
-- value. Dropping it would break legacy ALTER TABLE INSERTs.
