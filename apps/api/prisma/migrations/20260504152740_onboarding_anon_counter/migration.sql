-- CreateTable
CREATE TABLE "AnonCounter" (
    "role" "Role" NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AnonCounter_pkey" PRIMARY KEY ("role")
);
