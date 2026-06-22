export interface ScienceNote {
  id: string;
  title: string;
  body: string;
  sourceIds: string[];
}

export const scienceNotes: ScienceNote[] = [
  {
    id: "vo2-short-intervals",
    title: "Why 30/15 VO2 work?",
    body:
      "Short high-intensity repeats with incomplete recovery can accumulate repeated time at VO2-style intensities while keeping each effort short enough to repeat with control.",
    sourceIds: [
      "laursen-jenkins-2002-hiit",
      "buchheit-laursen-2013-hiit-part-1",
      "buchheit-laursen-2013-hiit-part-2",
    ],
  },
  {
    id: "power-zones",
    title: "Why these zones?",
    body:
      "Wattsmith groups workout time into broad FTP-based zones so riders can quickly see whether a session is mostly recovery, endurance, threshold, VO2, or higher-intensity work.",
    sourceIds: ["coggan-power-zones"],
  },
  {
    id: "load-metrics",
    title: "How load estimates are treated",
    body:
      "IF, TSS, and normalized-power style values are estimates in Wattsmith. They are useful for comparing workouts, but final training decisions should consider recent fatigue, goals, and completed ride data.",
    sourceIds: ["trainingpeaks-workout-builder-tss", "coggan-power-zones"],
  },
];

export function getScienceNote(id: string) {
  return scienceNotes.find((note) => note.id === id);
}
