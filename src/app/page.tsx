import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) {
    redirect("/sign-in");
  }

  const session = await auth();
  redirect(session?.user ? "/app" : "/sign-in");
}
