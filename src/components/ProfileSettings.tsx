"use client";

import { ProfilePanel } from "@/components/ProfilePanel";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { defaultIntegrationConnections } from "@/lib/workout/storage";
import type { AthleteProfile } from "@/lib/workout/types";
import { useMemo, useState } from "react";

export function ProfileSettings({ initialProfile }: { initialProfile: AthleteProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const workout = useMemo(() => ({ ...cloneDefaultWorkout(), ftp: profile.ftp }), [profile.ftp]);

  const updateProfile = (nextProfile: AthleteProfile) => {
    setProfile(nextProfile);
    void fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextProfile),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not save profile.");
        return response.json() as Promise<AthleteProfile>;
      })
      .then(setProfile)
      .catch(() => setProfile(nextProfile));
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 lg:px-8">
      <ProfilePanel
        profile={profile}
        workout={workout}
        integrations={defaultIntegrationConnections}
        onChange={updateProfile}
      />
    </div>
  );
}
