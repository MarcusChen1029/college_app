import { ESSAY_STATUSES, safeLink } from "@/lib/checklist";
import { PS_PROMPTS, UC_PIQS, UC_PICKS } from "@/lib/personal-essays";
import type { StudentDetail } from "@/lib/roster";

const statusLabel = Object.fromEntries(ESSAY_STATUSES) as Record<string, string>;

function Doc({ status, url }: { status?: string; url?: string }) {
  const href = url ? safeLink(url) : null;
  return (
    <p className="text-sm">
      <span className="font-semibold">{statusLabel[status ?? "not_started"] ?? status}</span>
      {href ? (
        <>
          {" · "}
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-4">
            Open document
          </a>
        </>
      ) : url ? (
        <span className="text-zinc-500"> · link isn&apos;t a web address</span>
      ) : (
        <span className="text-zinc-500"> · no link</span>
      )}
    </p>
  );
}

export function EssaysPanel({ detail }: { detail: StudentDetail }) {
  const essays = detail.essays;
  if (!essays) return <p className="text-sm text-zinc-500">{detail.displayName} hasn&apos;t shared essays with you.</p>;

  const ps = essays.ps;
  const prompt = PS_PROMPTS.find((p) => p.id === ps?.prompt);
  const picks = essays.uc?.picks ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-2 rounded-2xl border border-zinc-200 p-5">
        <h3 className="font-display text-lg font-bold">Common App personal statement</h3>
        <Doc status={ps?.status} url={ps?.url} />
        {prompt ? (
          <p className="text-sm text-zinc-600">
            <span className="font-semibold">Prompt {prompt.id}:</span> {prompt.text}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">No prompt chosen yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">
          UC personal insight questions{" "}
          <span className="text-sm font-normal text-zinc-500">
            ({picks.length} of {UC_PICKS} chosen)
          </span>
        </h3>
        {picks.length === 0 ? (
          <p className="text-sm text-zinc-500">No questions chosen yet.</p>
        ) : (
          <ul className="space-y-3">
            {picks.map((id) => {
              const q = UC_PIQS.find((x) => x.id === id);
              const doc = essays.uc?.docs?.[String(id)];
              return (
                <li key={id} className="space-y-1 rounded-2xl border border-zinc-200 p-4">
                  <p className="font-semibold">
                    Question {id}
                    {q && `: ${q.title}`}
                  </p>
                  {q && <p className="text-sm text-zinc-600">{q.text}</p>}
                  <Doc status={doc?.status} url={doc?.url} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
