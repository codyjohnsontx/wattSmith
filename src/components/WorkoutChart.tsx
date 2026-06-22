"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flattenWorkout } from "@/lib/workout/flatten";
import { formatClock } from "@/lib/workout/math";
import type { FlattenedSegment, Workout } from "@/lib/workout/types";

interface WorkoutChartProps {
  workout: Workout;
  selectedStepId?: string;
  onSelectStep?: (stepId: string) => void;
}

const chartWidth = 1000;
const chartHeight = 360;
const margin = { top: 28, right: 34, bottom: 48, left: 78 };
const tooltipWidth = 260;
const tooltipHeight = 116;
const tooltipOffset = 14;
const referencePercents = [0, 50, 75, 100, 120];

const zoneBands = [
  { label: "Recovery", min: 0, max: 55, color: "#334155" },
  { label: "Endurance", min: 55, max: 75, color: "#0f766e" },
  { label: "Tempo", min: 76, max: 87, color: "#2563eb" },
  { label: "Sweet Spot", min: 88, max: 94, color: "#7c3aed" },
  { label: "Threshold", min: 95, max: 105, color: "#eab308" },
  { label: "VO2", min: 106, max: 120, color: "#f97316" },
  { label: "Anaerobic", min: 120, max: 150, color: "#ef4444" },
];

function segmentColor(segment: FlattenedSegment) {
  const avgPercent = (segment.startPercentFTP + segment.endPercentFTP) / 2;

  if (segment.type === "warmup") return "#22c55e";
  if (segment.type === "cooldown") return "#38bdf8";
  if (avgPercent > 120) return "#ef4444";
  if (avgPercent >= 106) return "#f97316";
  if (avgPercent >= 95) return "#facc15";
  if (avgPercent < 55) return "#64748b";
  return "#14b8a6";
}

interface HoverState {
  segment: FlattenedSegment;
  chartSeconds: number;
  percentFTP: number;
  watts: number;
  zoneLabel: string;
  clientX: number;
  clientY: number;
  pinned: boolean;
}

interface ChartPoint {
  seconds: number;
  percentFTP: number;
  watts: number;
}

interface ChartBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ChartReferenceLine {
  percent?: number;
  watts: number;
  kind: "zero" | "ftp" | "grid" | "max";
}

function referenceKindForPercent(percent: number): ChartReferenceLine["kind"] {
  if (percent === 0) return "zero";
  if (percent === 100) return "ftp";
  return "grid";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSegmentAtSeconds(
  segments: FlattenedSegment[],
  seconds: number,
): FlattenedSegment | undefined {
  const epsilon = 0.001;
  const startsAtBoundary = segments.find(
    (segment) => Math.abs(segment.startSeconds - seconds) < epsilon,
  );

  if (startsAtBoundary) return startsAtBoundary;

  return segments.find(
    (segment) => seconds >= segment.startSeconds && seconds <= segment.endSeconds,
  );
}

function interpolateSegmentPoint(segment: FlattenedSegment, seconds: number): ChartPoint {
  if (segment.targetMode === "ramp") {
    const progress = clamp(
      (seconds - segment.startSeconds) / Math.max(1, segment.durationSeconds),
      0,
      1,
    );
    const percentFTP =
      segment.startPercentFTP +
      (segment.endPercentFTP - segment.startPercentFTP) * progress;
    const watts = segment.startWatts + (segment.endWatts - segment.startWatts) * progress;

    return {
      seconds,
      percentFTP: Math.round(percentFTP),
      watts: Math.round(watts),
    };
  }

  if (
    segment.targetMode === "range" &&
    segment.minPercentFTP !== undefined &&
    segment.maxPercentFTP !== undefined
  ) {
    const percentFTP = (segment.minPercentFTP + segment.maxPercentFTP) / 2;
    const watts =
      segment.minWatts !== undefined && segment.maxWatts !== undefined
        ? (segment.minWatts + segment.maxWatts) / 2
        : (segment.startWatts + segment.endWatts) / 2;

    return {
      seconds,
      percentFTP: Math.round(percentFTP),
      watts: Math.round(watts),
    };
  }

  return {
    seconds,
    percentFTP: Math.round((segment.startPercentFTP + segment.endPercentFTP) / 2),
    watts: Math.round((segment.startWatts + segment.endWatts) / 2),
  };
}

function getZoneLabel(percentFTP: number): string {
  if (percentFTP < 55) return "Recovery";
  if (percentFTP <= 75) return "Endurance";
  if (percentFTP <= 87) return "Tempo";
  if (percentFTP <= 94) return "Sweet Spot";
  if (percentFTP <= 105) return "Threshold";
  if (percentFTP <= 120) return "VO2";
  return "Anaerobic";
}

function formatSegmentTimeRange(segment: FlattenedSegment): string {
  return `${formatClock(segment.startSeconds)}-${formatClock(segment.endSeconds)} · ${formatClock(
    segment.durationSeconds,
  )}`;
}

function formatMode(segment: FlattenedSegment): string {
  if (segment.targetMode === "ramp") return "Ramp";
  if (segment.targetMode === "range") return "Range";
  return segment.type.charAt(0).toUpperCase() + segment.type.slice(1);
}

function getTargetDetail(segment: FlattenedSegment): string | undefined {
  if (segment.targetMode === "ramp") {
    return `Ramp: ${Math.round(segment.startPercentFTP)}-${Math.round(
      segment.endPercentFTP,
    )}% FTP`;
  }

  if (
    segment.targetMode === "range" &&
    segment.minPercentFTP !== undefined &&
    segment.maxPercentFTP !== undefined
  ) {
    return `Range: ${Math.round(segment.minPercentFTP)}-${Math.round(
      segment.maxPercentFTP,
    )}% FTP`;
  }

  return undefined;
}

function getTooltipText(state: HoverState): string {
  const detail = getTargetDetail(state.segment);
  return [
    state.segment.label,
    `${formatMode(state.segment)} · ${formatSegmentTimeRange(state.segment)}`,
    `${state.watts}W · ${state.percentFTP}% FTP`,
    state.zoneLabel,
    detail,
  ]
    .filter(Boolean)
    .join(". ");
}

function ChartTooltip({
  state,
  bounds,
}: {
  state: HoverState;
  bounds?: ChartBounds;
}) {
  const rawLeft = bounds ? state.clientX - bounds.left : state.clientX;
  const rawTop = bounds ? state.clientY - bounds.top : state.clientY;
  const maxLeft = Math.max(12, (bounds?.width ?? chartWidth) - tooltipWidth - 12);
  const maxTop = Math.max(12, (bounds?.height ?? chartHeight) - tooltipHeight - 12);
  const preferLeft = rawLeft + tooltipWidth + tooltipOffset > (bounds?.width ?? chartWidth);
  const preferTop =
    rawTop - tooltipHeight - tooltipOffset > 12 ||
    rawTop + tooltipHeight + tooltipOffset > (bounds?.height ?? chartHeight);
  const left = clamp(
    preferLeft ? rawLeft - tooltipWidth - tooltipOffset : rawLeft + tooltipOffset,
    12,
    maxLeft,
  );
  const top = clamp(
    preferTop ? rawTop - tooltipHeight - tooltipOffset : rawTop + tooltipOffset,
    12,
    maxTop,
  );
  const targetDetail = getTargetDetail(state.segment);
  const percentSuffix = state.segment.targetMode === "range" ? " midpoint" : "";
  const timeSuffix = state.segment.targetMode === "ramp" ? ` at ${formatClock(state.chartSeconds)}` : "";

  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-2xl shadow-black/40 backdrop-blur"
      style={{ left, top, width: "min(260px, calc(100% - 24px))" }}
    >
      <p className="truncate text-sm font-semibold text-slate-50">{state.segment.label}</p>
      <p className="mt-1 text-slate-400">
        {formatMode(state.segment)} · {formatSegmentTimeRange(state.segment)}
      </p>
      <p className="mt-1 font-semibold text-cyan-200">
        {state.watts}W · {state.percentFTP}% FTP{percentSuffix}
        {timeSuffix}
      </p>
      <p className="mt-1 text-slate-300">{state.zoneLabel}</p>
      {targetDetail ? <p className="mt-1 text-slate-400">{targetDetail}</p> : null}
      {state.pinned ? <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300">Pinned</p> : null}
    </div>
  );
}

export function WorkoutChart({ workout, selectedStepId, onSelectStep }: WorkoutChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverState, setHoverState] = useState<HoverState | undefined>();
  const [pinnedSegmentId, setPinnedSegmentId] = useState<string | undefined>();
  const [chartBounds, setChartBounds] = useState<ChartBounds | undefined>();
  const segments = useMemo(() => flattenWorkout(workout), [workout]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPinnedSegmentId(undefined);
      setHoverState(undefined);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [workout]);

  const totalSeconds = segments.at(-1)?.endSeconds ?? 1;
  const highestWatts = Math.max(
    1,
    ...segments.flatMap((segment) => [
      segment.startWatts,
      segment.endWatts,
      segment.minWatts ?? 0,
      segment.maxWatts ?? 0,
    ]),
  );
  const rawYMax = Math.max(workout.ftp * 1.3, highestWatts * 1.12);
  const yMax = Math.max(25, Math.ceil(rawYMax / 25) * 25);
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  const x = useCallback(
    (seconds: number) => margin.left + (seconds / totalSeconds) * innerWidth,
    [innerWidth, totalSeconds],
  );
  const y = useCallback(
    (watts: number) => margin.top + innerHeight - (watts / yMax) * innerHeight,
    [innerHeight, yMax],
  );
  const percentY = useCallback((percent: number) => y((workout.ftp * percent) / 100), [workout.ftp, y]);
  const tooltipAccessibleText = hoverState ? getTooltipText(hoverState) : "";

  const buildHoverState = useCallback(
    (segment: FlattenedSegment, seconds: number, clientX: number, clientY: number, pinned: boolean) => {
      const point = interpolateSegmentPoint(segment, seconds);
      return {
        segment,
        chartSeconds: Math.round(point.seconds),
        percentFTP: point.percentFTP,
        watts: point.watts,
        zoneLabel: getZoneLabel(point.percentFTP),
        clientX,
        clientY,
        pinned,
      };
    },
    [],
  );

  const getSecondsFromPointer = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return undefined;

      const rect = svg.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * chartWidth;
      const seconds = ((svgX - margin.left) / innerWidth) * totalSeconds;
      return clamp(seconds, 0, totalSeconds);
    },
    [innerWidth, totalSeconds],
  );

  const captureChartBounds = useCallback(() => {
    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect) return undefined;

    const bounds = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    setChartBounds(bounds);
    return bounds;
  }, []);

  const updateHoverFromPointer = useCallback(
    (event: { clientX: number; clientY: number }, pinned: boolean) => {
      if (pinnedSegmentId && !pinned) return;

      const seconds = getSecondsFromPointer(event.clientX);
      if (seconds === undefined) return;

      const segment = getSegmentAtSeconds(segments, seconds);
      if (!segment) return;

      captureChartBounds();
      setHoverState(buildHoverState(segment, seconds, event.clientX, event.clientY, pinned));

      if (pinned) {
        setPinnedSegmentId(segment.id);
        onSelectStep?.(segment.parentStepId);
      }
    },
    [
      buildHoverState,
      captureChartBounds,
      getSecondsFromPointer,
      onSelectStep,
      pinnedSegmentId,
      segments,
    ],
  );

  const showSegmentTooltip = useCallback(
    (
      segment: FlattenedSegment,
      pinned: boolean,
      event?: { clientX: number; clientY: number },
    ) => {
      if (pinnedSegmentId && !pinned) return;

      const seconds = segment.startSeconds + segment.durationSeconds / 2;
      captureChartBounds();
      const svgRect = svgRef.current?.getBoundingClientRect();
      const viewBoxX = x(seconds);
      const viewBoxY = y((segment.startWatts + segment.endWatts) / 2);
      const clientX =
        event?.clientX ??
        (svgRect ? svgRect.left + viewBoxX * (svgRect.width / chartWidth) : viewBoxX);
      const clientY =
        event?.clientY ??
        (svgRect ? svgRect.top + viewBoxY * (svgRect.height / chartHeight) : viewBoxY);

      setHoverState(buildHoverState(segment, seconds, clientX, clientY, pinned));

      if (pinned) {
        setPinnedSegmentId(segment.id);
        onSelectStep?.(segment.parentStepId);
      }
    },
    [buildHoverState, captureChartBounds, onSelectStep, pinnedSegmentId, x, y],
  );

  const clearTransientHover = useCallback(() => {
    setHoverState((current) => (current?.pinned ? current : undefined));
  }, []);

  const clearPinnedTooltip = useCallback(() => {
    setHoverState(undefined);
    setPinnedSegmentId(undefined);
  }, []);

  const pathPoints: string[] = [];

  for (const segment of segments) {
    const startPoint = `${x(segment.startSeconds).toFixed(1)},${y(segment.startWatts).toFixed(1)}`;
    const endPoint = `${x(segment.endSeconds).toFixed(1)},${y(segment.endWatts).toFixed(1)}`;

    if (pathPoints.length === 0) {
      pathPoints.push(`M ${startPoint}`);
    } else {
      pathPoints.push(`L ${startPoint}`);
    }

    pathPoints.push(`L ${endPoint}`);
  }

  const tickMinutes = totalSeconds > 3600 ? 10 : 5;
  const xTicks = Array.from(
    { length: Math.floor(totalSeconds / 60 / tickMinutes) + 1 },
    (_, index) => index * tickMinutes * 60,
  );
  const ftpReferenceLines: ChartReferenceLine[] =
    workout.ftp > 0
      ? referencePercents
          .map((percent) => ({
            percent,
            watts: Math.round((workout.ftp * percent) / 100),
            kind: referenceKindForPercent(percent),
          }))
          .filter((line) => line.watts <= yMax)
      : [{ percent: 0, watts: 0, kind: "zero" }];
  const shouldShowMaxLine = ftpReferenceLines.every(
    (line) => Math.abs(line.watts - yMax) > Math.max(10, workout.ftp * 0.08),
  );
  const referenceLines: ChartReferenceLine[] = shouldShowMaxLine
    ? [...ftpReferenceLines, { watts: yMax, kind: "max" }]
    : ftpReferenceLines;
  const labelX = margin.left - 10;
  const ftpLabelY = clamp(y(workout.ftp) - 13, margin.top + 4, margin.top + innerHeight - 24);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-2xl shadow-black/30">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Workout Preview
          </p>
          <h2 className="text-xl font-semibold text-slate-50">{workout.name}</h2>
        </div>
        <p className="text-sm text-slate-400">
          {formatClock(totalSeconds)} total · FTP {workout.ftp}W
        </p>
      </div>

      <div
        ref={chartContainerRef}
        className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="group"
          aria-label="Power timeline chart. Hover or tap intervals to inspect target watts and FTP percentage."
          className="h-auto min-h-[240px] w-full touch-manipulation"
          onPointerMove={(event) => updateHoverFromPointer(event, false)}
          onPointerLeave={clearTransientHover}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              clearPinnedTooltip();
            }
          }}
        >
          <rect width={chartWidth} height={chartHeight} fill="#020617" />

          {zoneBands.map((band) => {
            const yTop = Math.max(margin.top, percentY(band.max));
            const yBottom = Math.min(margin.top + innerHeight, percentY(band.min));
            return (
              <rect
                key={band.label}
                x={margin.left}
                y={yTop}
                width={innerWidth}
                height={Math.max(0, yBottom - yTop)}
                fill={band.color}
                opacity={0.045}
              />
            );
          })}

          {xTicks.map((tick) => (
            <line
              key={`${tick}-grid`}
              x1={x(tick)}
              x2={x(tick)}
              y1={margin.top}
              y2={margin.top + innerHeight}
              stroke="#0f172a"
            />
          ))}

          {referenceLines.map((line) => {
            const lineY = y(line.watts);
            const isFtp = line.kind === "ftp";
            const isZero = line.kind === "zero";
            const isMax = line.kind === "max";

            return (
              <g key={`${line.kind}-${line.watts}-${line.percent ?? "max"}`}>
                {isZero ? (
                  <rect
                    x={margin.left}
                    y={lineY - 1}
                    width={innerWidth}
                    height={2}
                    fill="#94a3b8"
                    opacity={0.55}
                  />
                ) : null}
              <line
                x1={margin.left}
                x2={chartWidth - margin.right}
                  y1={lineY}
                  y2={lineY}
                  stroke={isFtp ? "#22d3ee" : isZero ? "#64748b" : "#1e293b"}
                  strokeWidth={isFtp || isZero ? 2 : 1}
                  strokeDasharray={isFtp || isZero ? undefined : "5 7"}
                  opacity={isMax ? 0.75 : isFtp || isZero ? 1 : 0.82}
              />
            </g>
            );
          })}

          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1"
          />

          {segments.map((segment) => {
            const selected = segment.parentStepId === selectedStepId;
            const hovered = hoverState?.segment.id === segment.id || pinnedSegmentId === segment.id;
            const rectX = x(segment.startSeconds);
            const rectWidth = Math.max(1, x(segment.endSeconds) - x(segment.startSeconds));

            return (
              <g
                key={segment.id}
                tabIndex={0}
                role="button"
                aria-label={`${segment.label}. ${formatMode(segment)}. ${formatSegmentTimeRange(
                  segment,
                )}.`}
                className="outline-none"
                onPointerEnter={(event) => showSegmentTooltip(segment, false, event)}
                onClick={(event) => showSegmentTooltip(segment, true, event)}
                onFocus={() => showSegmentTooltip(segment, false)}
                onBlur={clearTransientHover}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    showSegmentTooltip(segment, true);
                  }

                  if (event.key === "Escape") {
                    clearPinnedTooltip();
                  }
                }}
              >
                <rect
                  x={rectX}
                  y={margin.top}
                  width={rectWidth}
                  height={innerHeight}
                  fill={segmentColor(segment)}
                  opacity={hovered ? 0.3 : selected ? 0.24 : 0.1}
                  className="cursor-pointer"
                />
                {segment.targetMode === "range" &&
                segment.minWatts !== undefined &&
                segment.maxWatts !== undefined ? (
                  <rect
                    x={rectX}
                    y={y(segment.maxWatts)}
                    width={rectWidth}
                    height={Math.max(2, y(segment.minWatts) - y(segment.maxWatts))}
                    fill={segmentColor(segment)}
                    opacity={hovered ? 0.38 : 0.28}
                  />
                ) : null}
                {selected || hovered ? (
                  <rect
                    x={rectX}
                    y={margin.top}
                    width={rectWidth}
                    height={innerHeight}
                    fill="none"
                    stroke={hovered ? "#f8fafc" : "#67e8f9"}
                    strokeWidth={hovered ? "3" : "2"}
                  />
                ) : null}
              </g>
            );
          })}

          <path
            d={pathPoints.join(" ")}
            fill="none"
            stroke="#020617"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="7"
            opacity="0.85"
            pointerEvents="none"
          />

          <path
            d={pathPoints.join(" ")}
            fill="none"
            stroke="#f8fafc"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
            pointerEvents="none"
          />

          {segments.map((segment) => (
            <line
              key={`${segment.id}-accent`}
              x1={x(segment.startSeconds)}
              x2={x(segment.endSeconds)}
              y1={y(segment.startWatts)}
              y2={y(segment.endWatts)}
              stroke={segmentColor(segment)}
              strokeLinecap="round"
              pointerEvents="none"
              strokeWidth={
                hoverState?.segment.id === segment.id || pinnedSegmentId === segment.id
                  ? 5
                  : segment.parentStepId === selectedStepId
                    ? 4
                    : 2
              }
            />
          ))}

          {referenceLines.map((line) => {
            const lineY = y(line.watts);
            const isFtp = line.kind === "ftp";
            const isZero = line.kind === "zero";
            const isMax = line.kind === "max";
            const labelColor = isFtp ? "#67e8f9" : isZero ? "#cbd5e1" : "#94a3b8";

            return (
              <text
                key={`${line.kind}-${line.watts}-${line.percent ?? "max"}-label`}
                x={labelX}
                y={lineY + (isZero ? -5 : 4)}
                textAnchor="end"
                fill={labelColor}
                fontSize="12"
                fontWeight={isFtp || isZero ? 700 : 500}
              >
                <tspan x={labelX}>{line.watts}W</tspan>
                {!isZero && !isMax && line.percent !== undefined ? (
                  <tspan x={labelX} dy="13" fill={isFtp ? "#22d3ee" : "#64748b"} fontSize="10">
                    {line.percent}%
                  </tspan>
                ) : null}
              </text>
            );
          })}

          {xTicks.map((tick) => (
            <text key={`${tick}-label`} x={x(tick) - 10} y={chartHeight - 16} fill="#94a3b8" fontSize="12">
              {Math.round(tick / 60)}m
            </text>
          ))}

          {workout.ftp > 0 ? (
            <g transform={`translate(${chartWidth - margin.right - 62}, ${ftpLabelY})`}>
              <rect width="54" height="20" rx="10" fill="#083344" stroke="#22d3ee" opacity="0.95" />
              <text
                x="27"
                y="14"
                textAnchor="middle"
                fill="#67e8f9"
                fontSize="11"
                fontWeight="700"
              >
                FTP
              </text>
            </g>
          ) : null}
        </svg>
        {hoverState ? <ChartTooltip state={hoverState} bounds={chartBounds} /> : null}
        <div className="sr-only" aria-live="polite">
          {tooltipAccessibleText}
        </div>
      </div>
    </section>
  );
}
