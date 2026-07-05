import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { dbProfileToAthleteProfile, defaultProfileDbInput } from "@/lib/training/profile";
import { ProfileSettings } from "@/components/ProfileSettings";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await db.athleteProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...defaultProfileDbInput(),
    },
    update: {},
  });

  return <ProfileSettings initialProfile={dbProfileToAthleteProfile(profile)} />;
}
