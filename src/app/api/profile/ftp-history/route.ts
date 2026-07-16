import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addFtpHistoryEntry, FtpHistoryError, ftpHistoryToDto, getOrCreateAthleteProfile } from "@/lib/server/profile";

function historyErrorResponse(error: unknown) {
  return error instanceof FtpHistoryError ? Response.json({ error: error.message }, { status: error.status }) : undefined;
}

export async function GET() {
  try {
    const user = await requireUser();
    await getOrCreateAthleteProfile(user.id);
    const entries = await db.athleteFtpHistory.findMany({ where: { userId: user.id }, orderBy: { effectiveFrom: "desc" } });
    return Response.json(entries.map(ftpHistoryToDto));
  } catch (error) {
    const response = authenticationErrorResponse(error) ?? historyErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = await request.json().catch(() => undefined) as { ftp?: unknown; effectiveFrom?: unknown } | undefined;
    const entry = await addFtpHistoryEntry(user.id, payload?.ftp, payload?.effectiveFrom);
    return Response.json(ftpHistoryToDto(entry), { status: 201 });
  } catch (error) {
    const response = authenticationErrorResponse(error) ?? historyErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
