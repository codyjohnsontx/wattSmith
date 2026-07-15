"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/client/api";
import type { ActivityPage, ActivitySummary } from "@/lib/activity/types";
import type { StravaConnectionStatus } from "@/lib/integrations/strava/types";

export function ActivitiesClient() {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [connection, setConnection] = useState<StravaConnectionStatus | null>(null);
  const [status, setStatus] = useState("Loading activities…");

  const loadPage = async (nextPage: number) => {
    setStatus(nextPage === 1 ? "Loading activities…" : "Loading older rides…");
    try {
      const result = await apiRequest<ActivityPage>(`/api/activities?page=${nextPage}&perPage=50`);
      setActivities((current) => nextPage === 1 ? result.activities : [...current, ...result.activities]);
      setPage(result.page);
      setHasMore(result.hasMore);
      setStatus(`Cached through ${new Date(result.cacheExpiresAt).toLocaleDateString()}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Activities could not be loaded.");
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setHasMore(false);
    }
  };

  useEffect(() => {
    void apiRequest<StravaConnectionStatus>("/api/integrations/strava").then((result) => {
      setConnection(result);
      if (result.connected && !result.reconnectRequired) void loadPage(1);
      else setStatus(result.reconnectRequired ? "Reconnect Strava with full activity access." : "Connect Strava to load your cycling history.");
    }).catch((error) => setStatus(error instanceof Error ? error.message : "Connection status unavailable."));
  }, []);

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8"><header className="flex flex-col gap-5 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Activities</p><h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Cycling history</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Page backward through completed rides. Detailed streams load only when you open an analysis.</p></div>{connection && (!connection.connected || connection.reconnectRequired) ? <a href="/api/integrations/strava/connect" className="bg-[#fc4c02] px-5 py-3 text-center text-sm font-semibold text-white">{connection.connected ? "Reconnect Strava" : "Connect Strava"}</a> : connection?.connected ? <button type="button" onClick={() => void apiRequest<void>("/api/integrations/strava", { method: "DELETE" }).then(() => { setConnection({ connected: false, scopes: [], reconnectRequired: false, cacheRetentionDays: 7 }); setActivities([]); setStatus("Strava disconnected and cached data removed."); })} className="border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300">Disconnect Strava</button> : null}</header><div className="flex items-center justify-between border-b border-slate-800 py-4"><p className="text-sm text-slate-400" aria-live="polite">{status}</p><Link href="/demo" className="text-sm font-semibold text-cyan-200 underline underline-offset-4">View public demo</Link></div>{activities.length ? <div className="divide-y divide-slate-800">{activities.map((activity) => <Link key={activity.id} href={`/activities/${activity.id}`} className="grid gap-3 py-5 transition hover:bg-slate-900/40 md:grid-cols-[minmax(0,1fr)_repeat(4,110px)] md:items-center"><div><h2 className="font-semibold text-white">{activity.name}</h2><p className="mt-1 text-sm text-slate-500">{new Date(activity.startedAt).toLocaleString()} · {activity.sportType}{activity.trainer ? " · Indoor" : ""}</p></div><p className="text-sm text-slate-300"><span className="block text-xs uppercase text-slate-600">Time</span>{Math.round(activity.movingTimeSeconds / 60)} min</p><p className="text-sm text-slate-300"><span className="block text-xs uppercase text-slate-600">Distance</span>{(activity.distanceMeters / 1000).toFixed(1)} km</p><p className="text-sm text-slate-300"><span className="block text-xs uppercase text-slate-600">Power</span>{activity.averagePower === null ? "—" : `${Math.round(activity.averagePower)}W`}</p><p className="text-sm text-slate-300"><span className="block text-xs uppercase text-slate-600">Heart rate</span>{activity.averageHeartRate === null ? "—" : `${Math.round(activity.averageHeartRate)} bpm`}</p></Link>)}</div> : <div className="py-16 text-center text-slate-500">No cycling activities loaded.</div>}{hasMore ? <div className="border-t border-slate-800 py-6 text-center"><button type="button" onClick={() => void loadPage(page + 1)} className="border border-slate-700 px-5 py-3 text-sm font-semibold text-white">Load older rides</button></div> : null}</div></main>;
}
