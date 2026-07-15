import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { dbProfileToAthleteProfile } from "@/lib/training/profile";
import { getOrCreateAthleteProfile } from "@/lib/server/profile";
import { LocalMigrationPrompt } from "@/components/LocalMigrationPrompt";

export default async function DashboardPage() {
  const user = await requireUser();
  const [profile, workoutCount] = await Promise.all([
    getOrCreateAthleteProfile(user.id),
    db.structuredWorkout.count({ where: { userId: user.id } }),
  ]);
  const athleteProfile = dbProfileToAthleteProfile(profile);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid w-full max-w-[1520px] gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <LocalMigrationPrompt />

        <section className="border-b border-slate-800 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Training command center
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Analyze completed rides, keep dated FTP context, and turn selected demands into workouts for export.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              FTP
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">{athleteProfile.ftp}W</p>
            <p className="mt-1 text-sm capitalize text-slate-400">
              {athleteProfile.experienceLevel} rider
            </p>
          </div>
          <div className="border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Weekly Availability
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">{athleteProfile.weeklyHours}h</p>
            <p className="mt-1 text-sm text-slate-400">
              {athleteProfile.availableDays.join(", ") || "No days set"}
            </p>
          </div>
          <div className="border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Workout Library
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">{workoutCount}</p>
            <p className="mt-1 text-sm text-slate-400">server-saved workouts</p>
          </div>
        </section>

        <section className="border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Profile Summary
          </h2>
          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-slate-500">Primary goal</dt>
              <dd className="mt-1 text-slate-100">{athleteProfile.primaryGoal}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Preferred duration</dt>
              <dd className="mt-1 text-slate-100">
                {athleteProfile.preferredWorkoutDurationMinutes} minutes
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Target event</dt>
              <dd className="mt-1 text-slate-100">
                {athleteProfile.targetEventDate
                  ? new Date(athleteProfile.targetEventDate).toLocaleDateString()
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Constraints</dt>
              <dd className="mt-1 text-slate-100">
                {athleteProfile.constraints.join(", ") || "None"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
