// An empty list that says what goes here and how to start: a doodle, a short title, one line, and the next step.
export function EmptyState({ art, title, children, actions }: { art: React.ReactNode; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-blue-50 px-6 py-12 text-center">
      <div className="mb-5 h-16">{art}</div>
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-zinc-600">{children}</p>
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
