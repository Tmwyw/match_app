-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "archivedByA" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedByB" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);
