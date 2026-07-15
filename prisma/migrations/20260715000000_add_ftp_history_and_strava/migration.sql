-- CreateTable
CREATE TABLE "AthleteFtpHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ftp" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AthleteFtpHistory_pkey" PRIMARY KEY ("id")
);

-- Backfill one dated FTP record for every existing profile.
INSERT INTO "AthleteFtpHistory" ("id", "userId", "ftp", "effectiveFrom", "source", "createdAt", "updatedAt")
SELECT 'ftp_' || md5("userId" || "createdAt"::text), "userId", "ftp", "createdAt"::date, 'migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AthleteProfile";

-- CreateTable
CREATE TABLE "StravaConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StravaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaCacheEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StravaCacheEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteFtpHistory_userId_effectiveFrom_key" ON "AthleteFtpHistory"("userId", "effectiveFrom");
CREATE INDEX "AthleteFtpHistory_userId_effectiveFrom_idx" ON "AthleteFtpHistory"("userId", "effectiveFrom");
CREATE UNIQUE INDEX "StravaConnection_userId_key" ON "StravaConnection"("userId");
CREATE INDEX "StravaConnection_athleteId_idx" ON "StravaConnection"("athleteId");
CREATE UNIQUE INDEX "StravaCacheEntry_userId_resourceKey_key" ON "StravaCacheEntry"("userId", "resourceKey");
CREATE INDEX "StravaCacheEntry_expiresAt_idx" ON "StravaCacheEntry"("expiresAt");

ALTER TABLE "AthleteFtpHistory" ADD CONSTRAINT "AthleteFtpHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StravaConnection" ADD CONSTRAINT "StravaConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StravaCacheEntry" ADD CONSTRAINT "StravaCacheEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
