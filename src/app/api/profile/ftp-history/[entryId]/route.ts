import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { deleteFtpHistoryEntry, FtpHistoryError, ftpHistoryToDto, updateFtpHistoryEntry } from "@/lib/server/profile";

type Context = { params: Promise<{ entryId: string }> };

function historyErrorResponse(error: unknown) {
  return error instanceof FtpHistoryError ? Response.json({ error: error.message }, { status: error.status }) : undefined;
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { entryId } = await context.params;
    const payload = await request.json().catch(() => undefined) as { ftp?: unknown; effectiveFrom?: unknown } | undefined;
    if (
      typeof payload !== "object"
      || payload === null
      || Array.isArray(payload)
      || (!("ftp" in payload) && !("effectiveFrom" in payload))
    ) {
      return Response.json({ error: "A JSON body is required." }, { status: 400 });
    }
    const entry = await updateFtpHistoryEntry(user.id, entryId, payload);
    return Response.json(ftpHistoryToDto(entry));
  } catch (error) {
    const response = authenticationErrorResponse(error) ?? historyErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { entryId } = await context.params;
    await deleteFtpHistoryEntry(user.id, entryId);
    return new Response(null, { status: 204 });
  } catch (error) {
    const response = authenticationErrorResponse(error) ?? historyErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
