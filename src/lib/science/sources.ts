export interface ScienceSource {
  id: string;
  title: string;
  authors?: string;
  year?: number;
  url: string;
  sourceType: "peer-reviewed" | "coaching-methodology" | "platform-doc";
  topics: string[];
}

export const scienceSources: ScienceSource[] = [
  {
    id: "coggan-power-zones",
    title: "Cycling Power Zones Explained",
    authors: "Andrew Coggan / TrainingPeaks",
    year: 2015,
    url: "https://www.trainingpeaks.com/blog/power-training-levels/",
    sourceType: "coaching-methodology",
    topics: ["zones", "ftp", "power"],
  },
  {
    id: "laursen-jenkins-2002-hiit",
    title: "The scientific basis for high-intensity interval training",
    authors: "Paul B. Laursen and David G. Jenkins",
    year: 2002,
    url: "https://pubmed.ncbi.nlm.nih.gov/11772161/",
    sourceType: "peer-reviewed",
    topics: ["hiit", "vo2", "endurance"],
  },
  {
    id: "buchheit-laursen-2013-hiit-part-1",
    title: "High-intensity interval training, solutions to the programming puzzle: Part I",
    authors: "Martin Buchheit and Paul B. Laursen",
    year: 2013,
    url: "https://pubmed.ncbi.nlm.nih.gov/23539308/",
    sourceType: "peer-reviewed",
    topics: ["hiit", "vo2", "programming"],
  },
  {
    id: "buchheit-laursen-2013-hiit-part-2",
    title: "High-intensity interval training, solutions to the programming puzzle: Part II",
    authors: "Martin Buchheit and Paul B. Laursen",
    year: 2013,
    url: "https://pubmed.ncbi.nlm.nih.gov/23832851/",
    sourceType: "peer-reviewed",
    topics: ["hiit", "anaerobic", "programming"],
  },
  {
    id: "seiler-2010-intensity-distribution",
    title: "What is best practice for training intensity and duration distribution?",
    authors: "Stephen Seiler",
    year: 2010,
    url: "https://pubmed.ncbi.nlm.nih.gov/20861519/",
    sourceType: "peer-reviewed",
    topics: ["intensity-distribution", "endurance"],
  },
  {
    id: "stoggl-sperlich-2014-polarized",
    title: "Polarized training has greater impact on key endurance variables",
    authors: "Thomas Stöggl and Billy Sperlich",
    year: 2014,
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3912323/",
    sourceType: "peer-reviewed",
    topics: ["polarized-training", "endurance"],
  },
  {
    id: "trainingpeaks-workout-builder-tss",
    title: "TrainingPeaks Workout Builder",
    authors: "Dirk Friel / TrainingPeaks",
    year: 2016,
    url: "https://www.trainingpeaks.com/learn/articles/introducing-trainingpeaks-workout-builder/",
    sourceType: "platform-doc",
    topics: ["tss", "workout-builder", "dynamic-targets"],
  },
  {
    id: "trainerroad-mrc-erg-import",
    title: "Creating a Workout from an ERG or MRC File",
    authors: "TrainerRoad Support",
    url: "https://support.trainerroad.com/hc/en-us/articles/201944204-Creating-a-Workout-from-an-ERG-or-MRC-File",
    sourceType: "platform-doc",
    topics: ["export", "mrc", "erg"],
  },
];

export function getScienceSource(id: string) {
  return scienceSources.find((source) => source.id === id);
}
