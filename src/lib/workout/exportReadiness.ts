import { safeFileName } from "./exportMrc";
import { flattenWorkout } from "./flatten";
import { formatDuration } from "./math";
import type {
  ExportRangeStrategy,
  Workout,
  WorkoutSummary,
  WorkoutValidationIssue,
} from "./types";

export type ExportReadinessStatus = "pass" | "warn" | "error";

export interface ExportReadinessItem {
  id: string;
  label: string;
  status: ExportReadinessStatus;
  message: string;
  details?: string[];
}

export interface ExportReadinessInput {
  workout: Workout;
  rangeStrategy: ExportRangeStrategy;
  validationIssues: WorkoutValidationIssue[];
  summary: WorkoutSummary;
  mrc: string;
  erg: string;
}

function formatPercent(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

function hasCourseSections(preview: string): boolean {
  return (
    preview.trim().length > 0 &&
    preview.includes("[COURSE HEADER]") &&
    preview.includes("[COURSE DATA]")
  );
}

export function buildExportReadinessChecklist({
  workout,
  rangeStrategy,
  validationIssues,
  summary,
  mrc,
  erg,
}: ExportReadinessInput): ExportReadinessItem[] {
  const validationErrors = validationIssues.filter((issue) => issue.severity === "error");
  const validationWarnings = validationIssues.filter((issue) => issue.severity === "warning");
  const validationItem: ExportReadinessItem =
    validationErrors.length > 0
      ? {
          id: "validation",
          label: "Validation",
          status: "error",
          message: `Fix ${validationErrors.length} blocking issue(s) before export.`,
          details: validationIssues.map((issue) => issue.message),
        }
      : validationWarnings.length > 0
        ? {
            id: "validation",
            label: "Validation",
            status: "warn",
            message: `Review ${validationWarnings.length} warning(s); export is still available.`,
            details: validationIssues.map((issue) => issue.message),
          }
        : {
            id: "validation",
            label: "Validation",
            status: "pass",
            message: "Workout structure is valid for export.",
          };

  const segments = flattenWorkout(workout, rangeStrategy);
  const highestPercent = Math.max(
    0,
    ...segments.flatMap((segment) =>
      [
        segment.startPercentFTP,
        segment.endPercentFTP,
        segment.minPercentFTP,
        segment.maxPercentFTP,
      ].filter((percent): percent is number => percent !== undefined),
    ),
  );
  const hasRanges = segments.some((segment) => segment.targetMode === "range");
  const filename = safeFileName(workout.name);

  return [
    validationItem,
    Number.isFinite(workout.ftp) && workout.ftp > 0
      ? {
          id: "ftp",
          label: "FTP",
          status: "pass",
          message: `FTP is set to ${workout.ftp}W.`,
        }
      : {
          id: "ftp",
          label: "FTP",
          status: "error",
          message: "Set an FTP greater than zero before export.",
        },
    summary.totalDurationSeconds <= 0
      ? {
          id: "timeline",
          label: "Timeline",
          status: "error",
          message: "Workout has no exportable duration.",
        }
      : summary.totalDurationSeconds > 4 * 60 * 60
        ? {
            id: "timeline",
            label: "Timeline",
            status: "warn",
            message: "Workout is unusually long; review the preview before importing.",
          }
        : {
            id: "timeline",
            label: "Timeline",
            status: "pass",
            message: `Timeline duration is ${formatDuration(summary.totalDurationSeconds)}.`,
          },
    summary.highestWatts <= 0
      ? {
          id: "targets",
          label: "Target sanity",
          status: "error",
          message: "No positive power targets are available for export.",
        }
      : highestPercent > 200
        ? {
            id: "targets",
            label: "Target sanity",
            status: "warn",
            message: `Highest target is ${formatPercent(highestPercent)}% FTP; review for typos.`,
          }
        : {
            id: "targets",
            label: "Target sanity",
            status: "pass",
            message: `Highest target is ${summary.highestWatts}W.`,
          },
    {
      id: "range-strategy",
      label: "Range export strategy",
      status: "pass",
      message: hasRanges
        ? `Range targets will export using the ${rangeStrategy} value.`
        : "No range targets need conversion.",
    },
    hasCourseSections(mrc) && hasCourseSections(erg)
      ? {
          id: "preview",
          label: "File preview",
          status: "pass",
          message: "MRC and ERG previews are generated.",
        }
      : {
          id: "preview",
          label: "File preview",
          status: "error",
          message: "One or more export previews could not be generated.",
        },
    filename
      ? {
          id: "filename",
          label: "Filename",
          status: "pass",
          message: `Download filename is ${filename.toLowerCase()}.mrc/.erg.`,
        }
      : {
          id: "filename",
          label: "Filename",
          status: "warn",
          message: "Filename will use the fallback wattsmith_workout.",
        },
  ];
}
