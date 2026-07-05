import { auth } from "@/auth";
import { NextResponse } from "next/server";

const protectedApiPrefixes = ["/api/profile", "/api/workouts", "/api/migration"];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isProtectedApi = protectedApiPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isProtectedPage =
    pathname.startsWith("/app") || pathname.startsWith("/workouts") || pathname.startsWith("/settings");

  if (!request.auth && isProtectedApi) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!request.auth && isProtectedPage) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*", "/workouts/:path*", "/settings/:path*", "/api/profile/:path*", "/api/workouts/:path*", "/api/migration/:path*"],
};
