import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { db } from "./lib/server/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret:
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "development-only-wattsmith-auth-secret" : undefined),
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  providers: [GitHub],
  session: {
    strategy: "database",
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
    authorized({ auth: session }) {
      return Boolean(session?.user);
    },
  },
});
