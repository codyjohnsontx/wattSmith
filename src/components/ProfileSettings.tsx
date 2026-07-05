"use client";

import { ProfilePanel } from "@/components/ProfilePanel";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { loadIntegrationConnections } from "@/lib/workout/storage";
import type { AthleteProfile, IntegrationConnection } from "@/lib/workout/types";
import { useEffect, useMemo, useRef, useState } from "react";

export function ProfileSettings({ initialProfile }: { initialProfile: AthleteProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
  const [error, setError] = useState("");
  const saveVersionRef = useRef(0);
  const workout = useMemo(() => ({ ...cloneDefaultWorkout(), ftp: profile.ftp }), [profile.ftp]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIntegrations(loadIntegrationConnections());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const updateProfile = (nextProfile: AthleteProfile) => {
    const previousProfile = profile;
    const saveVersion = saveVersionRef.current + 1;
    saveVersionRef.current = saveVersion;
    setError("");
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
      .then((savedProfile) => {
        if (saveVersionRef.current === saveVersion) {
          setProfile(savedProfile);
        }
      })
      .catch((saveError) => {
        if (saveVersionRef.current === saveVersion) {
          setProfile(previousProfile);
          setError(saveError instanceof Error ? saveError.message : "Could not save profile.");
        }
      });
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 lg:px-8">
      <ProfilePanel
        profile={profile}
        workout={workout}
        integrations={integrations}
        onChange={updateProfile}
      />
      {error ? (
        <p className="mt-4 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
