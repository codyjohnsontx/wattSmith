"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ActivityDetail, ComparisonMetric } from "@/lib/activity/types";

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.round(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function metric(value: number | null, suffix = "", digits = 0) {
  return value === null ? "—" : `${value.toFixed(digits)}${suffix}`;
}

function comparisonText(value: ComparisonMetric, suffix: string) {
  return `${metric(value.first, suffix)} → ${metric(value.final, suffix)}`;
}

export function ActivityAnalysisView({ detail, demo = false }: { detail: ActivityDetail; demo?: boolean }) {
  const [series, setSeries] = useState({ power: true, heartRate: true, cadence: true });
  const { activity, analysis } = detail;
  const paths = useMemo(() => {
    const width = 1200;
    const height = 320;
    const maximumSecond = Math.max(1, analysis.chart.at(-1)?.second ?? 1);
    const maximumFor = (key: "power" | "heartRate" | "cadence") => {
      const values = analysis.chart.map((point) => point[key]).filter((value): value is number => value !== null);
      return Math.max(1, ...(values.map((value) => value * 1.08)));
    };
    const build = (key: "power" | "heartRate" | "cadence", maximum: number) => {
      let started = false;
      let previousSegment: number | undefined;
      return analysis.chart.map((point) => {
        if (point[key] === null) { started = false; return null; }
        if (previousSegment !== undefined && previousSegment !== point.segment) started = false;
        const command = started ? "L" : "M";
        started = true;
        previousSegment = point.segment;
        return `${command}${(point.second / maximumSecond) * width},${height - ((point[key] ?? 0) / maximum) * (height - 24)}`;
      }).filter(Boolean).join(" ");
    };
    return {
      power: build("power", maximumFor("power")),
      heartRate: build("heartRate", maximumFor("heartRate")),
      cadence: build("cadence", maximumFor("cadence")),
    };
  }, [analysis.chart]);
  const summary = [
    ["Average power", metric(analysis.summary.averagePower, "W")],
    ["Weighted power", metric(analysis.summary.weightedPower, "W")],
    ["Intensity factor", metric(analysis.summary.intensityFactor, "", 2)],
    ["Estimated TSS", metric(analysis.summary.estimatedTss)],
    ["Variability", metric(analysis.summary.variabilityIndex, "", 2)],
    ["Work", metric(analysis.summary.workKilojoules, "kJ")],
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Wattsmith analysis</p>
              {demo ? <span className="border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Demo</span> : null}
            </div>
            <Link href={demo ? "/demo" : "/activities"} className="text-sm font-semibold text-slate-300 underline decoration-slate-600 underline-offset-4">Back to activities</Link>
          </div>
          <p className="mt-8 text-sm text-slate-400">{new Date(activity.startedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} · {activity.sportType} · {detail.source === "strava" ? "Source: Strava" : "Source: synthetic Wattsmith fixture"}</p>
          <h1 className="mt-2 max-w-5xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">{activity.name}</h1>
          <div className="mt-5 flex flex-wrap gap-x-7 gap-y-2 text-sm text-slate-300">
            <span>{duration(activity.movingTimeSeconds)} moving</span>
            <span>{(activity.distanceMeters / 1000).toFixed(1)} km</span>
            <span>{Math.round(activity.elevationGainMeters)} m climbing</span>
            <span>{activity.trainer ? "Indoor" : "Outdoor"}</span>
          </div>
        </header>

        <section aria-labelledby="summary-heading" className="border-b border-slate-800 py-7">
          <h2 id="summary-heading" className="sr-only">Summary metrics</h2>
          <dl className="grid grid-cols-2 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
            {summary.map(([label, value], index) => <div key={label} className={`pr-4 ${index ? "md:border-l md:border-slate-800 md:pl-5" : ""}`}><dt className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</dt><dd className="mt-2 text-2xl font-semibold text-white">{value}</dd></div>)}
          </dl>
        </section>

        <section aria-labelledby="timeline-heading" className="border-b border-slate-800 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 id="timeline-heading" className="text-2xl font-semibold text-white">Moving timeline</h2><p className="mt-2 text-sm text-slate-400">Paused time is removed. Each series uses its own scale.</p></div>
            <div className="flex flex-wrap gap-2" aria-label="Chart series">
              {([ ["power", "Power", "bg-cyan-300"], ["heartRate", "Heart rate", "bg-rose-400"], ["cadence", "Cadence", "bg-lime-300"] ] as const).map(([key, label, color]) => <button key={key} type="button" aria-pressed={series[key]} onClick={() => setSeries((current) => ({ ...current, [key]: !current[key] }))} className={`border px-3 py-2 text-xs font-semibold transition ${series[key] ? "border-slate-500 text-white" : "border-slate-800 text-slate-500"}`}><span className={`mr-2 inline-block h-2 w-2 rounded-full ${color}`} />{label}</button>)}
            </div>
          </div>
          <div className="mt-6 overflow-hidden border-y border-slate-800 bg-slate-950" role="img" aria-label="Power, heart rate, and cadence over moving time">
            <svg viewBox="0 0 1200 320" className="h-[280px] w-full" preserveAspectRatio="none">
              {[80,160,240].map((y) => <line key={y} x1="0" x2="1200" y1={y} y2={y} stroke="#1e293b" />)}
              {series.power ? <path d={paths.power} fill="none" stroke="#67e8f9" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
              {series.heartRate ? <path d={paths.heartRate} fill="none" stroke="#fb7185" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity=".82" /> : null}
              {series.cadence ? <path d={paths.cadence} fill="none" stroke="#bef264" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity=".78" /> : null}
            </svg>
          </div>
        </section>

        <div className="grid gap-10 border-b border-slate-800 py-8 xl:grid-cols-[1fr_1fr]">
          <section aria-labelledby="zones-heading"><h2 id="zones-heading" className="text-2xl font-semibold text-white">Power zones</h2><p className="mt-2 text-sm text-slate-400">Time allocated using {analysis.ftp}W FTP, effective {analysis.ftpEffectiveFrom}.</p><div className="mt-6 space-y-4">{analysis.powerZones.map((zone) => <div key={zone.id} className="grid grid-cols-[110px_1fr_76px] items-center gap-3 text-sm"><span className="text-slate-300">{zone.label}</span><div className="h-2 bg-slate-800"><div className="h-full" style={{ width: `${zone.percent}%`, background: zone.color }} /></div><span className="text-right tabular-nums text-slate-400">{duration(zone.seconds)}</span></div>)}</div></section>
          <section aria-labelledby="peaks-heading"><h2 id="peaks-heading" className="text-2xl font-semibold text-white">Peak efforts</h2><p className="mt-2 text-sm text-slate-400">Best rolling averages with the 80% sample-validity rule applied.</p><table className="mt-5 w-full text-left text-sm"><thead className="border-b border-slate-700 text-xs uppercase tracking-[0.14em] text-slate-500"><tr><th className="py-3">Window</th><th className="py-3 text-right">Power</th><th className="py-3 text-right">Starts at</th></tr></thead><tbody>{analysis.peakEfforts.map((effort) => <tr key={effort.durationSeconds} className="border-b border-slate-800"><td className="py-4 text-slate-200">{effort.label}</td><td className="py-4 text-right font-semibold text-white">{metric(effort.watts, "W")}</td><td className="py-4 text-right text-slate-400">{effort.startMovingSecond === null ? "—" : duration(effort.startMovingSecond)}</td></tr>)}</tbody></table></section>
        </div>

        <div className="grid gap-10 py-8 xl:grid-cols-[1fr_1fr]">
          <section aria-labelledby="durability-heading"><h2 id="durability-heading" className="text-2xl font-semibold text-white">First vs final third</h2><p className="mt-2 text-sm text-slate-400">Comparisons describe change across the ride; they are not automatic diagnoses.</p>{analysis.durability ? <dl className="mt-6 divide-y divide-slate-800">{[["Power", analysis.durability.power, "W"], ["Heart rate", analysis.durability.heartRate, " bpm"], ["Cadence", analysis.durability.cadence, " rpm"]].map(([label, value, suffix]) => { const comparison = value as ComparisonMetric; return <div key={label as string} className="flex items-center justify-between gap-4 py-4"><dt className="text-slate-400">{label as string}</dt><dd className="text-right"><span className="font-semibold text-white">{comparisonText(comparison, suffix as string)}</span><span className="ml-3 text-sm text-slate-500">{metric(comparison.percentDelta, "%", 1)}</span></dd></div>; })}</dl> : <p className="mt-6 text-slate-400">Not enough moving data for this comparison.</p>}</section>
          <section aria-labelledby="quality-heading"><h2 id="quality-heading" className="text-2xl font-semibold text-white">Data quality & calculations</h2><p className="mt-2 text-sm text-slate-400">Power coverage: {analysis.dataQuality.powerCoveragePercent.toFixed(1)}% · {analysis.dataQuality.hasDevicePower ? "Device power" : "Estimated or absent power"}</p><ul className="mt-6 space-y-3 text-sm leading-6 text-slate-300">{analysis.dataQuality.notes.map((note) => <li key={note} className="border-l border-slate-700 pl-4">{note}</li>)}</ul>{analysis.dataQuality.missingStreams.length ? <p className="mt-5 text-sm text-amber-200">Unavailable: {analysis.dataQuality.missingStreams.join(", ")}. Missing metrics are omitted rather than shown as zero.</p> : null}{!demo ? <Link href="/settings#ftp-history" className="mt-5 inline-block text-sm font-semibold text-cyan-200 underline underline-offset-4">Review FTP history</Link> : null}</section>
        </div>

        {demo ? <footer className="border-t border-slate-800 py-8 text-center"><p className="text-sm text-slate-400">This race is entirely synthetic and runs through the same analytics engine as connected activities.</p><Link href="/sign-in" className="mt-4 inline-block bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">Sign in and connect Strava</Link></footer> : null}
      </div>
    </main>
  );
}
