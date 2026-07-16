"use client";

import { ProfilePanel } from "@/components/ProfilePanel";
import { apiRequest } from "@/lib/client/api";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { loadIntegrationConnections } from "@/lib/workout/storage";
import type { IntegrationConnection } from "@/lib/integrations/types";
import type { AthleteProfile } from "@/lib/workout/types";
import { useEffect, useMemo, useState } from "react";

export function ProfileSettings({ initialProfile }: { initialProfile: AthleteProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
  const workout = useMemo(() => ({ ...cloneDefaultWorkout(), ftp: profile.ftp }), [profile.ftp]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIntegrations(loadIntegrationConnections());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const saveProfile = async (nextProfile: AthleteProfile) => {
    const saved = await apiRequest<AthleteProfile>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(nextProfile),
    });
    setProfile(saved);
    return saved;
  };

  const reloadProfile = async () => {
    const latest = await apiRequest<AthleteProfile>("/api/profile");
    setProfile(latest);
    return latest;
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 lg:px-8">
      <ProfilePanel
        profile={profile}
        workout={workout}
        integrations={integrations}
        onSave={saveProfile}
        onReload={reloadProfile}
      />
    </div>
  );
}
