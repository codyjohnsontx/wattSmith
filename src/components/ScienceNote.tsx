import type { ScienceNote } from "@/lib/science/notes";
import { getScienceSource, type ScienceSource } from "@/lib/science/sources";

interface ScienceNoteCardProps {
  note: ScienceNote;
}

export function ScienceNoteCard({ note }: ScienceNoteCardProps) {
  const sources = note.sourceIds
    .map(getScienceSource)
    .filter((source): source is ScienceSource => Boolean(source));

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <h3 className="text-sm font-semibold text-slate-100">{note.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{note.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sources.map((source) => (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100"
          >
            {source.authors ? `${source.authors}, ${source.year}` : source.title}
          </a>
        ))}
      </div>
    </article>
  );
}
