import { signIn } from "@/auth";

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl || "/app";
  const hasGitHubProvider = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  const hasSecret = Boolean(process.env.AUTH_SECRET);
  const setupErrors = [
    !hasGitHubProvider ? "AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required for GitHub sign-in." : "",
    !hasSecret ? "AUTH_SECRET is required." : "",
  ].filter(Boolean);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md border border-slate-800 bg-slate-900/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
          Wattsmith
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Sign in to your training workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Use GitHub to save your athlete profile and workout library to the server.
        </p>

        {setupErrors.length > 0 ? (
          <div className="mt-5 space-y-2 border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
            {setupErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        {params?.error ? (
          <p className="mt-5 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">
            Sign-in failed. Check the OAuth app settings and try again.
          </p>
        ) : null}

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            disabled={setupErrors.length > 0}
            className="h-11 w-full bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Sign in with GitHub
          </button>
        </form>
      </section>
    </main>
  );
}
