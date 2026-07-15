import type { AthleteFtpHistory, AthleteProfile, Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { defaultProfileDbInput } from "@/lib/training/profile";

export const FTP_MIN = 1;
export const FTP_MAX = 2000;

export class FtpHistoryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FtpHistoryError";
  }
}

export interface FtpHistoryDto {
  id: string;
  ftp: number;
  effectiveFrom: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export function parseDateOnly(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FtpHistoryError("effectiveFrom must use YYYY-MM-DD.", 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new FtpHistoryError("effectiveFrom must be a valid calendar date.", 400);
  }
  return date;
}

export function parseFtp(value: unknown): number {
  const ftp = Number(value);
  if (!Number.isInteger(ftp) || ftp < FTP_MIN || ftp > FTP_MAX) {
    throw new FtpHistoryError(`ftp must be an integer from ${FTP_MIN} to ${FTP_MAX}.`, 400);
  }
  return ftp;
}

export function ftpHistoryToDto(entry: AthleteFtpHistory): FtpHistoryDto {
  return {
    id: entry.id,
    ftp: entry.ftp,
    effectiveFrom: entry.effectiveFrom.toISOString().slice(0, 10),
    source: entry.source,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export async function getOrCreateAthleteProfile(userId: string): Promise<AthleteProfile> {
  return db.$transaction(async (transaction) => {
    const profile = await transaction.athleteProfile.upsert({
      where: { userId },
      create: { userId, ...defaultProfileDbInput() },
      update: {},
    });
    await transaction.athleteFtpHistory.upsert({
      where: {
        userId_effectiveFrom: { userId, effectiveFrom: profile.createdAt },
      },
      create: {
        userId,
        ftp: profile.ftp,
        effectiveFrom: profile.createdAt,
        source: "profile-initialization",
      },
      update: {},
    });
    return profile;
  });
}

async function recomputeCurrentFtp(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const latest = await transaction.athleteFtpHistory.findFirst({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!latest) throw new FtpHistoryError("At least one FTP history entry is required.", 409);
  await transaction.athleteProfile.update({ where: { userId }, data: { ftp: latest.ftp } });
}

export async function addFtpHistoryEntry(userId: string, ftp: unknown, effectiveFrom: unknown) {
  const parsedFtp = parseFtp(ftp);
  const parsedDate = parseDateOnly(effectiveFrom);
  try {
    return await db.$transaction(async (transaction) => {
      await getProfileInsideTransaction(transaction, userId);
      const entry = await transaction.athleteFtpHistory.create({
        data: { userId, ftp: parsedFtp, effectiveFrom: parsedDate, source: "manual" },
      });
      await recomputeCurrentFtp(transaction, userId);
      return entry;
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw new FtpHistoryError("An FTP entry already exists for this date.", 409);
    throw error;
  }
}

async function getProfileInsideTransaction(transaction: Prisma.TransactionClient, userId: string) {
  const profile = await transaction.athleteProfile.findUnique({ where: { userId } });
  if (!profile) throw new FtpHistoryError("Athlete profile not found.", 404);
  return profile;
}

function isUniqueConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function updateFtpHistoryEntry(
  userId: string,
  entryId: string,
  values: { ftp?: unknown; effectiveFrom?: unknown },
) {
  const ftp = values.ftp === undefined ? undefined : parseFtp(values.ftp);
  const effectiveFrom = values.effectiveFrom === undefined ? undefined : parseDateOnly(values.effectiveFrom);
  try {
    return await db.$transaction(async (transaction) => {
      const existing = await transaction.athleteFtpHistory.findFirst({ where: { id: entryId, userId } });
      if (!existing) throw new FtpHistoryError("FTP history entry not found.", 404);
      const entry = await transaction.athleteFtpHistory.update({
        where: { id: existing.id },
        data: { ...(ftp === undefined ? {} : { ftp }), ...(effectiveFrom ? { effectiveFrom } : {}) },
      });
      await recomputeCurrentFtp(transaction, userId);
      return entry;
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw new FtpHistoryError("An FTP entry already exists for this date.", 409);
    throw error;
  }
}

export async function deleteFtpHistoryEntry(userId: string, entryId: string) {
  await db.$transaction(async (transaction) => {
    const existing = await transaction.athleteFtpHistory.findFirst({ where: { id: entryId, userId } });
    if (!existing) throw new FtpHistoryError("FTP history entry not found.", 404);
    const count = await transaction.athleteFtpHistory.count({ where: { userId } });
    if (count <= 1) throw new FtpHistoryError("The final FTP history entry cannot be deleted.", 409);
    await transaction.athleteFtpHistory.delete({ where: { id: existing.id } });
    await recomputeCurrentFtp(transaction, userId);
  });
}

export async function resolveFtpForDate(userId: string, activityDate: Date) {
  const entry = await db.athleteFtpHistory.findFirst({
    where: { userId, effectiveFrom: { lte: activityDate } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (entry) return entry;
  const earliest = await db.athleteFtpHistory.findFirst({
    where: { userId },
    orderBy: { effectiveFrom: "asc" },
  });
  if (!earliest) throw new FtpHistoryError("No FTP history is available for this athlete.", 409);
  return earliest;
}

export async function syncCurrentProfileFtp(userId: string, ftp: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await db.$transaction(async (transaction) => {
    await transaction.athleteFtpHistory.upsert({
      where: { userId_effectiveFrom: { userId, effectiveFrom: today } },
      create: { userId, ftp, effectiveFrom: today, source: "profile" },
      update: { ftp, source: "profile" },
    });
    await recomputeCurrentFtp(transaction, userId);
  });
}
