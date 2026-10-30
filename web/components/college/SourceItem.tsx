// One numbered entry of the college page's Sources list; the page's [n] links jump to its id. Used for the page's own
// sources and for the supplements file's sources that continue the numbering.
export function SourceItem({ n, url, title, accessed }: { n: number; url: string; title: string; accessed: string }) {
  return (
    <li id={`src-${n}`} className="mb-4 flex break-inside-avoid gap-3">
      <span className="w-8 shrink-0 pt-0.5 text-sm text-zinc-600 tabular-nums">[{n}]</span>
      <span className="min-w-0">
        <a className="font-medium break-words text-blue-700 hover:underline" href={url} target="_blank" rel="noreferrer">
          {title}
        </a>
        <span className="block text-sm text-zinc-600">{accessed}</span>
      </span>
    </li>
  );
}
