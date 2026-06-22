import { flattenWorkout } from "@/lib/workout/flatten";
import { formatClock } from "@/lib/workout/math";
import type { FlattenedSegment, Workout } from "@/lib/workout/types";

interface WorkoutChartProps {
  workout: Workout;
}

const chartWidth = 1000;
const chartHeight = 320;
const margin = { top: 22, right: 18, bottom: 42, left: 58 };

function segmentColor(segment: FlattenedSegment) {
  const avgPercent = (segment.startPercentFTP + segment.endPercentFTP) / 2;

  if (segment.type === "warmup") return "#22c55e";
  if (segment.type === "cooldown") return "#38bdf8";
  if (avgPercent >= 106) return "#f97316";
  if (avgPercent >= 95) return "#facc15";
  if (avgPercent < 55) return "#64748b";
  return "#14b8a6";
}

export function WorkoutChart({ workout }: WorkoutChartProps) {
  const segments = flattenWorkout(workout);
  const totalSeconds = segments.at(-1)?.endSeconds ?? 1;
  const highestWatts = Math.max(1, ...segments.flatMap((segment) => [segment.startWatts, segment.endWatts]));
  const yMax = Math.max(workout.ftp * 1.25, highestWatts * 1.15);
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  const x = (seconds: number) => margin.left + (seconds / totalSeconds) * innerWidth;
  const y = (watts: number) => margin.top + innerHeight - (watts / yMax) * innerHeight;

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
  const yTicks = [0, Math.round(workout.ftp * 0.5), workout.ftp, Math.ceil(yMax / 25) * 25].filter(
    (value, index, values) => values.indexOf(value) === index,
  );

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

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label="Power timeline chart"
          className="h-auto w-full"
        >
          <rect width={chartWidth} height={chartHeight} fill="#020617" />

          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={chartWidth - margin.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === workout.ftp ? "#22d3ee" : "#1e293b"}
                strokeDasharray={tick === workout.ftp ? "0" : "5 6"}
              />
              <text x={18} y={y(tick) + 4} fill="#94a3b8" fontSize="12">
                {tick}W
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={x(tick)}
                x2={x(tick)}
                y1={margin.top}
                y2={margin.top + innerHeight}
                stroke="#0f172a"
              />
              <text x={x(tick) - 10} y={chartHeight - 16} fill="#94a3b8" fontSize="12">
                {Math.round(tick / 60)}m
              </text>
            </g>
          ))}

          {segments.map((segment) => {
            const title = `${segment.label}: ${formatClock(segment.durationSeconds)}, ${Math.round(segment.startPercentFTP)}-${Math.round(segment.endPercentFTP)}% FTP`;

            return (
              <rect
                key={segment.id}
                x={x(segment.startSeconds)}
                y={margin.top}
                width={Math.max(1, x(segment.endSeconds) - x(segment.startSeconds))}
                height={innerHeight}
                fill={segmentColor(segment)}
                opacity={0.12}
              >
                <title>{title}</title>
              </rect>
            );
          })}

          <path
            d={pathPoints.join(" ")}
            fill="none"
            stroke="#f8fafc"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
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
              strokeWidth="2"
            />
          ))}

          <text x={chartWidth - 86} y={y(workout.ftp) - 8} fill="#67e8f9" fontSize="12">
            FTP
          </text>
        </svg>
      </div>
    </section>
  );
}
