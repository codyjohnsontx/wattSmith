"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client/api";
import type { ActivityDetail } from "@/lib/activity/types";
import { ActivityAnalysisView } from "@/components/ActivityAnalysisView";

export function ActivityDetailClient({ activityId }: { activityId: string }) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<ActivityDetail>(`/api/activities/${activityId}`).then(setDetail).catch((reason) => setError(reason instanceof Error ? reason.message : "Analysis could not be loaded.")); }, [activityId]);
  if (detail) return <ActivityAnalysisView detail={detail} />;
  return <main className="min-h-screen bg-slate-950 px-6 py-20 text-center text-slate-300"><p aria-live="polite">{error || "Loading activity streams and analysis…"}</p></main>;
}
