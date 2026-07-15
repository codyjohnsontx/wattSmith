"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client/api";
import type { FtpHistoryDto } from "@/lib/server/profile";

export function FtpHistoryPanel() {
  const [entries, setEntries] = useState<FtpHistoryDto[]>([]);
  const [ftp, setFtp] = useState(250);
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Loading FTP history…");

  const load = async () => {
    const result = await apiRequest<FtpHistoryDto[]>("/api/profile/ftp-history");
    setEntries(result);
    setStatus("");
    return result;
  };

  useEffect(() => {
    void apiRequest<FtpHistoryDto[]>("/api/profile/ftp-history")
      .then((result) => { setEntries(result); setStatus(""); })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not load FTP history."));
  }, []);

  const add = async () => {
    setStatus("Saving FTP entry…");
    try {
      await apiRequest<FtpHistoryDto>("/api/profile/ftp-history", { method: "POST", body: JSON.stringify({ ftp, effectiveFrom }) });
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save FTP entry."); }
  };

  const remove = async (id: string) => {
    setStatus("Deleting FTP entry…");
    try { await apiRequest<void>(`/api/profile/ftp-history/${id}`, { method: "DELETE" }); await load(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not delete FTP entry."); }
  };

  return <section id="ftp-history" className="mt-6 border-t border-slate-800 pt-6"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">FTP history</p><h2 className="mt-1 text-xl font-semibold text-white">Dated thresholds</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Activity analysis uses the latest FTP effective on or before the ride date.</p></div><div className="grid grid-cols-[110px_160px_auto] gap-2"><label className="text-xs text-slate-400">FTP<input aria-label="New FTP" type="number" min="1" max="2000" value={ftp} onChange={(event) => setFtp(Number(event.target.value))} className="mt-1 h-10 w-full border border-slate-700 bg-slate-950 px-3 text-white" /></label><label className="text-xs text-slate-400">Effective date<input aria-label="FTP effective date" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="mt-1 h-10 w-full border border-slate-700 bg-slate-950 px-3 text-white" /></label><button type="button" onClick={() => void add()} className="mt-5 h-10 bg-cyan-300 px-4 text-sm font-semibold text-slate-950">Add</button></div></div><p className="mt-3 text-sm text-slate-400" aria-live="polite">{status}</p><div className="mt-4 divide-y divide-slate-800 border-y border-slate-800">{entries.map((entry) => <div key={entry.id} className="grid grid-cols-[1fr_120px_auto] items-center py-3 text-sm"><div><span className="font-semibold text-white">{entry.ftp}W</span><span className="ml-3 text-slate-500">{entry.source}</span></div><time className="text-slate-300">{entry.effectiveFrom}</time><button type="button" disabled={entries.length === 1} onClick={() => void remove(entry.id)} className="text-xs font-semibold text-red-300 disabled:opacity-30">Delete</button></div>)}</div></section>;
}
