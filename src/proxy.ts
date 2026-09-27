import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const config = {
  matcher: [
    "/app/:path*",
    "/workouts/:path*",
    "/settings/:path*",
    "/activities/:path*",
    "/ride/:path*",
    "/api/profile/:path*",
    "/api/workouts/:path*",
    "/api/migration/:path*",
    "/api/activities/:path*",
  ],
};

const protectedRoutePrefixes = config.matcher.map((matcher) => matcher.replace("/:path*", ""));

function matchesProtectedRoute(pathname: string, type: "api" | "page") {
  return protectedRoutePrefixes.some((prefix) => {
    const isApiRoute = prefix.startsWith("/api/");
    return (type === "api" ? isApiRoute : !isApiRoute) && pathname.startsWith(prefix);
  });
}

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isProtectedApi = matchesProtectedRoute(pathname, "api");
  const isProtectedPage = matchesProtectedRoute(pathname, "page");

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
