"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client/api";
import type { ActivityDetail } from "@/lib/activity/types";
import { ActivityAnalysisView } from "@/components/ActivityAnalysisView";

export function ActivityDetailClient({ activityId }: { activityId: string }) {
  const [result, setResult] = useState<{ activityId: string; detail: ActivityDetail | null; error: string }>({
    activityId: "",
    detail: null,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    void apiRequest<ActivityDetail>(`/api/activities/${activityId}`)
      .then((detail) => { if (!cancelled) setResult({ activityId, detail, error: "" }); })
      .catch((reason) => {
        if (!cancelled) setResult({
          activityId,
          detail: null,
          error: reason instanceof Error ? reason.message : "Analysis could not be loaded.",
        });
      });
    return () => { cancelled = true; };
  }, [activityId]);
  const detail = result.activityId === activityId ? result.detail : null;
  const error = result.activityId === activityId ? result.error : "";
  if (detail) return <ActivityAnalysisView detail={detail} />;
  return <main className="min-h-screen bg-slate-950 px-6 py-20 text-center text-slate-300"><p aria-live="polite">{error || "Loading activity streams and analysis…"}</p></main>;
}
