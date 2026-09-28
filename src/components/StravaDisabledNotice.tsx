import Link from "next/link";

export function StravaDisabledNotice() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Activities</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Strava is not enabled</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Strava is not connected on this deployment, so Strava activity analysis is switched off. Once ride recording ships, recorded rides will download as a .fit file you can upload to Strava yourself.
        </p>
        <Link href="/demo" className="mt-6 inline-block text-sm font-semibold text-cyan-200 underline underline-offset-4">
          View public demo
        </Link>
      </div>
    </main>
  );
}
