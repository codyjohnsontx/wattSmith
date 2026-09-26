"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { flattenWorkout } from "@/lib/workout/flatten";
import { formatClock } from "@/lib/workout/math";
import type { FlattenedSegment, Workout } from "@/lib/workout/types";
import { zoneForPercent, zones } from "@/lib/workout/zones";

interface WorkoutChartProps {
  workout: Workout;
  selectedStepId?: string;
  onSelectStep?: (stepId: string) => void;
}

const chartWidth = 1400;
const chartHeight = 470;
const margin = { top: 36, right: 44, bottom: 62, left: 100 };
const tooltipWidth = 260;
const tooltipHeight = 116;
const tooltipOffset = 14;
const referencePercents = [0, 50, 75, 100, 120];

function segmentColor(segment: FlattenedSegment) {
  const avgPercent = (segment.startPercentFTP + segment.endPercentFTP) / 2;
  return zoneForPercent(avgPercent).color;
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

interface ViewBoxTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function referenceKindForPercent(percent: number): ChartReferenceLine["kind"] {
  if (percent === 0) return "zero";
  if (percent === 100) return "ftp";
  return "grid";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewBoxTransform(svgRect: DOMRect): ViewBoxTransform {
  const scale = Math.min(svgRect.width / chartWidth, svgRect.height / chartHeight) || 1;

  return {
    scale,
    offsetX: (svgRect.width - chartWidth * scale) / 2,
    offsetY: (svgRect.height - chartHeight * scale) / 2,
  };
}

function viewBoxPointToClient(svgRect: DOMRect, viewBoxX: number, viewBoxY: number) {
  const transform = getViewBoxTransform(svgRect);

  return {
    clientX: svgRect.left + transform.offsetX + viewBoxX * transform.scale,
    clientY: svgRect.top + transform.offsetY + viewBoxY * transform.scale,
  };
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
  return zoneForPercent(percentFTP).label;
}

function formatSegmentTimeRange(segment: FlattenedSegment): string {
  return `${formatClock(segment.startSeconds)}-${formatClock(segment.endSeconds)} · ${formatClock(
    segment.durationSeconds,
  )}`;
}

function formatMode(segment: FlattenedSegment): string {
  if (segment.ergEnabled === false) return "Free ride, no ERG target";
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
  onClose,
}: {
  state: HoverState;
  bounds?: ChartBounds;
  onClose: () => void;
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
      className={`absolute z-20 max-w-[260px] rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-2xl shadow-black/40 backdrop-blur ${
        state.pinned ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{ left, top, width: "min(260px, calc(100% - 24px))" }}
    >
      {state.pinned ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close pinned tooltip"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
      <p className={`truncate text-sm font-semibold text-slate-50 ${state.pinned ? "pr-5" : ""}`}>
        {state.segment.label}
      </p>
      <p className="mt-1 text-slate-400">
        {formatMode(state.segment)} · {formatSegmentTimeRange(state.segment)}
      </p>
      <p className="mt-1 font-semibold text-cyan-200">
        {state.watts}W · {state.percentFTP}% FTP{percentSuffix}
        {timeSuffix}
      </p>
      <p className="mt-1 text-slate-300">{state.zoneLabel}</p>
      {targetDetail ? <p className="mt-1 text-slate-400">{targetDetail}</p> : null}
      {state.pinned ? (
        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-300">
          Pinned · click away or press Esc to close
        </p>
      ) : null}
    </div>
  );
}

export function WorkoutChart({ workout, selectedStepId, onSelectStep }: WorkoutChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const freeRidePatternId = `free-ride-${useId().replace(/:/g, "")}`;
  const previousWorkoutRef = useRef(workout);
  const pinnedParentStepIdRef = useRef<string | undefined>(undefined);
  const [hoverState, setHoverState] = useState<HoverState | undefined>();
  const [pinnedSegmentId, setPinnedSegmentId] = useState<string | undefined>();
  const [chartBounds, setChartBounds] = useState<ChartBounds | undefined>();
  const segments = useMemo(() => flattenWorkout(workout), [workout]);

  useEffect(() => {
    const workoutChanged = previousWorkoutRef.current !== workout;
    previousWorkoutRef.current = workout;

    if (!workoutChanged && pinnedParentStepIdRef.current === selectedStepId) return;

    const timeoutId = window.setTimeout(() => {
      pinnedParentStepIdRef.current = undefined;
      setPinnedSegmentId(undefined);
      setHoverState(undefined);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [workout, selectedStepId]);

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
      const transform = getViewBoxTransform(rect);
      const svgX = (clientX - rect.left - transform.offsetX) / transform.scale;
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
        pinnedParentStepIdRef.current = segment.parentStepId;
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

      // Clicking the already-pinned segment again toggles the tooltip off.
      if (pinned && pinnedSegmentId === segment.id) {
        pinnedParentStepIdRef.current = undefined;
        setHoverState(undefined);
        setPinnedSegmentId(undefined);
        return;
      }

      const seconds = segment.startSeconds + segment.durationSeconds / 2;
      captureChartBounds();
      const svgRect = svgRef.current?.getBoundingClientRect();
      const viewBoxX = x(seconds);
      const viewBoxY = y((segment.startWatts + segment.endWatts) / 2);
      const fallbackPoint = svgRect
        ? viewBoxPointToClient(svgRect, viewBoxX, viewBoxY)
        : { clientX: viewBoxX, clientY: viewBoxY };
      const clientX = event?.clientX ?? fallbackPoint.clientX;
      const clientY = event?.clientY ?? fallbackPoint.clientY;

      setHoverState(buildHoverState(segment, seconds, clientX, clientY, pinned));

      if (pinned) {
        pinnedParentStepIdRef.current = segment.parentStepId;
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
    pinnedParentStepIdRef.current = undefined;
    setHoverState(undefined);
    setPinnedSegmentId(undefined);
  }, []);

  // While a tooltip is pinned, dismiss it on an outside click or on Escape from
  // anywhere (including when focus has moved to the tooltip's close button).
  useEffect(() => {
    if (!pinnedSegmentId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const container = chartContainerRef.current;
      if (container && !container.contains(event.target as Node)) {
        clearPinnedTooltip();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearPinnedTooltip();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pinnedSegmentId, clearPinnedTooltip]);

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
  const labelX = margin.left - 14;
  const ftpLabelY = clamp(y(workout.ftp) - 18, margin.top + 4, margin.top + innerHeight - 32);

  // Crosshair marker pinning the exact target watts/%FTP at the hovered point.
  const markerLabel = hoverState
    ? `${hoverState.watts}W · ${hoverState.percentFTP}% FTP`
    : "";
  const markerChipWidth = markerLabel ? markerLabel.length * 8.6 + 20 : 0;
  const marker = hoverState
    ? {
        x: x(hoverState.chartSeconds),
        y: y(hoverState.watts),
        label: markerLabel,
        chipWidth: markerChipWidth,
        chipX: clamp(
          x(hoverState.chartSeconds) - markerChipWidth / 2,
          margin.left,
          chartWidth - margin.right - markerChipWidth,
        ),
        chipY: clamp(
          y(hoverState.watts) - 36,
          margin.top + 2,
          margin.top + innerHeight - 28,
        ),
      }
    : undefined;

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

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {zones.map((zone) => (
          <div key={zone.id} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: zone.color }}
            />
            <span className="text-xs text-slate-400">{zone.label}</span>
          </div>
        ))}
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
          className="block h-auto max-h-[480px] min-h-[300px] w-full touch-manipulation"
          onPointerMove={(event) => updateHoverFromPointer(event, false)}
          onPointerLeave={clearTransientHover}
          onClick={clearPinnedTooltip}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              clearPinnedTooltip();
            }
          }}
        >
          <defs>
            <pattern id={freeRidePatternId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="10" stroke="#020617" strokeWidth="4" opacity="0.55" />
            </pattern>
          </defs>
          <rect width={chartWidth} height={chartHeight} fill="#020617" />

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
                    y={lineY - 1.5}
                    width={innerWidth}
                    height={3}
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
                  strokeWidth={isFtp || isZero ? 3 : 1.5}
                  strokeDasharray={isFtp || isZero ? undefined : "7 9"}
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
            const endX = x(segment.endSeconds);
            const rectWidth = Math.max(1, endX - rectX);
            const color = segmentColor(segment);
            const baselineY = margin.top + innerHeight;
            const startY = y(segment.startWatts);
            const endY = y(segment.endWatts);
            const areaPath = `M ${rectX.toFixed(1)},${startY.toFixed(1)} L ${endX.toFixed(
              1,
            )},${endY.toFixed(1)} L ${endX.toFixed(1)},${baselineY.toFixed(1)} L ${rectX.toFixed(
              1,
            )},${baselineY.toFixed(1)} Z`;

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
                onClick={(event) => {
                  event.stopPropagation();
                  showSegmentTooltip(segment, true, event);
                }}
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
                {/* Full-height hit target + subtle column highlight on hover/select. */}
                <rect
                  x={rectX}
                  y={margin.top}
                  width={rectWidth}
                  height={innerHeight}
                  fill={color}
                  opacity={hovered ? 0.16 : selected ? 0.12 : 0}
                  pointerEvents="all"
                  className="cursor-pointer"
                />
                {/* Colored intensity silhouette from the power line down to baseline. */}
                <path
                  d={areaPath}
                  fill={color}
                  opacity={hovered ? 0.68 : selected ? 0.6 : 0.5}
                  pointerEvents="none"
                />
                {/* Free-ride blocks send no ERG target: hatch the placeholder. */}
                {segment.ergEnabled === false ? (
                  <path d={areaPath} fill={`url(#${freeRidePatternId})`} pointerEvents="none" />
                ) : null}
                {segment.targetMode === "range" &&
                segment.minWatts !== undefined &&
                segment.maxWatts !== undefined ? (
                  <rect
                    x={rectX}
                    y={y(segment.maxWatts)}
                    width={rectWidth}
                    height={Math.max(2, y(segment.minWatts) - y(segment.maxWatts))}
                    fill={color}
                    opacity={hovered ? 0.45 : 0.35}
                    pointerEvents="none"
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
                    strokeWidth={hovered ? "4" : "3"}
                    pointerEvents="none"
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
            strokeWidth="2"
            opacity="0.7"
            pointerEvents="none"
          />

          <path
            d={pathPoints.join(" ")}
            fill="none"
            stroke="#f8fafc"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            pointerEvents="none"
          />

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
                fontSize="17"
                fontWeight={isFtp || isZero ? 700 : 500}
              >
                <tspan x={labelX}>{line.watts}W</tspan>
                {!isZero && !isMax && line.percent !== undefined ? (
                  <tspan x={labelX} dy="18" fill={isFtp ? "#22d3ee" : "#64748b"} fontSize="13">
                    {line.percent}%
                  </tspan>
                ) : null}
              </text>
            );
          })}

          {xTicks.map((tick) => (
            <text key={`${tick}-label`} x={x(tick) - 14} y={chartHeight - 20} fill="#94a3b8" fontSize="17">
              {Math.round(tick / 60)}m
            </text>
          ))}

          {workout.ftp > 0 ? (
            <g transform={`translate(${chartWidth - margin.right - 84}, ${ftpLabelY})`}>
              <rect width="74" height="27" rx="14" fill="#083344" stroke="#22d3ee" opacity="0.95" />
              <text
                x="37"
                y="18"
                textAnchor="middle"
                fill="#67e8f9"
                fontSize="15"
                fontWeight="700"
              >
                FTP
              </text>
            </g>
          ) : null}

          {marker ? (
            <g pointerEvents="none">
              <line
                x1={marker.x}
                x2={marker.x}
                y1={margin.top}
                y2={margin.top + innerHeight}
                stroke="#f8fafc"
                strokeWidth={1}
                strokeDasharray="4 6"
                opacity={0.45}
              />
              <circle cx={marker.x} cy={marker.y} r={5.5} fill="#f8fafc" stroke="#020617" strokeWidth={2} />
              <g transform={`translate(${marker.chipX}, ${marker.chipY})`}>
                <rect
                  width={marker.chipWidth}
                  height={24}
                  rx={6}
                  fill="#020617"
                  stroke="#334155"
                  opacity={0.95}
                />
                <text
                  x={marker.chipWidth / 2}
                  y={16}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="14"
                  fontWeight="600"
                >
                  {marker.label}
                </text>
              </g>
            </g>
          ) : null}
        </svg>
        {hoverState ? (
          <ChartTooltip state={hoverState} bounds={chartBounds} onClose={clearPinnedTooltip} />
        ) : null}
        <div className="sr-only" aria-live="polite">
          {tooltipAccessibleText}
        </div>
      </div>
    </section>
  );
}
