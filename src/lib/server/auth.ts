import { auth } from "@/auth";

export class AuthenticationError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationError";
  }
}

export async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new AuthenticationError();
  }

  return {
    id: userId,
    name: session.user?.name ?? null,
    email: session.user?.email ?? null,
    image: session.user?.image ?? null,
  };
}

export function authenticationErrorResponse(error: unknown): Response | undefined {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  return undefined;
}
