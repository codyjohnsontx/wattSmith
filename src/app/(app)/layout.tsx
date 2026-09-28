import { signOut } from "@/auth";
import { AuthenticationError, requireUser } from "@/lib/server/auth";
import { isStravaEnabled } from "@/lib/server/strava/config";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/sign-in");
    }

    throw error;
  }

  const identity = user.name || user.email || "Signed-in athlete";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/app" className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Wattsmith
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm font-semibold text-slate-400">
              <Link href="/app" className="px-3 py-2 transition hover:text-slate-100">
                Dashboard
              </Link>
              <Link href="/workouts" className="px-3 py-2 transition hover:text-slate-100">
                Workouts
              </Link>
              {isStravaEnabled() ? (
                <Link href="/activities" className="px-3 py-2 transition hover:text-slate-100">
                  Activities
                </Link>
              ) : null}
              <Link href="/settings" className="px-3 py-2 transition hover:text-slate-100">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span>{identity}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button
                type="submit"
                className="border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-300"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
