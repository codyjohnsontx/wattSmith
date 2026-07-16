import { requireUser } from "@/lib/server/auth";
import { getOrCreateAthleteProfile } from "@/lib/server/profile";
import { dbProfileToAthleteProfile } from "@/lib/training/profile";
import { ProfileSettings } from "@/components/ProfileSettings";
import { FtpHistoryPanel } from "@/components/FtpHistoryPanel";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getOrCreateAthleteProfile(user.id);

  return <div><ProfileSettings initialProfile={dbProfileToAthleteProfile(profile)} /><div className="mx-auto w-full max-w-[1520px] px-4 pb-10 sm:px-6 lg:px-8"><FtpHistoryPanel /></div></div>;
}
