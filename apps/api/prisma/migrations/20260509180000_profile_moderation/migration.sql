-- Profile moderation: NULL = pending admin review, non-null = approved at timestamp.
-- Existing users with a profile row are backfilled to their `createdAt` so they
-- aren't retroactively locked out by the new gate.

ALTER TABLE "User" ADD COLUMN "profileApprovedAt" TIMESTAMP(3);

UPDATE "User" u
SET "profileApprovedAt" = u."createdAt"
WHERE EXISTS (
  SELECT 1 FROM "BuyerProfile" b WHERE b."userId" = u."id"
)
   OR EXISTS (
  SELECT 1 FROM "OwnerProfile" o WHERE o."userId" = u."id"
);
