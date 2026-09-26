import { IMPORT_FILE_EXTENSIONS } from "@/lib/ride/formats/detect";
import type { WorkoutFileFormat } from "@/lib/ride/formats/types";
import { readWorkoutFile } from "@/lib/ride/importFile";
import type { Workout } from "@/lib/workout/types";
import { useCallback, useRef, useState } from "react";

export interface ImportedWorkout {
  workout: Workout;
  warnings: string[];
  fileName: string;
  format: WorkoutFileFormat;
}

// Shared by the "Import file" button and the library's drop target.
export function useWorkoutFileImport(fallbackFtp: number, onImported: (draft: ImportedWorkout) => void) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const importFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setError("");
      try {
        const result = await readWorkoutFile(file, fallbackFtp);
        if (result.ok) {
          onImported({ workout: result.workout, warnings: result.warnings, fileName: file.name, format: result.format });
        } else {
          setError(`${file.name}: ${result.error}`);
        }
      } finally {
        setImporting(false);
      }
    },
    [fallbackFtp, onImported],
  );

  return { importing, error, importFile, dismissError: () => setError("") };
}

export function ImportWorkoutButton({
  importing,
  onFile,
}: {
  importing: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={importing}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 disabled:cursor-wait disabled:opacity-60"
      >
        {importing ? "Importing…" : "Import file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_FILE_EXTENSIONS.join(",")}
        aria-label="Import workout file"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so choosing the same file again still fires a change.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
