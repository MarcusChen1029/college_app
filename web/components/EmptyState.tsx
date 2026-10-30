// Empty screens and empty sections: say what will appear here, and offer the one next step as a real button.

/** A whole screen or tab with nothing in it yet: a sky field with a title, one ink sentence, the next step as buttons, and a
 *  doodle at the side (above on a phone). */
export function EmptyState({ art, title, children, actions }: { art: React.ReactNode; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="grid items-center gap-6 rounded-3xl bg-blue-50 px-6 py-10 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-10 sm:px-10 sm:py-12">
      <div className="max-w-xl">
        <h2 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[28px]">{title}</h2>
        <p className="mt-3 text-base leading-relaxed text-ink">{children}</p>
        {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
      </div>
      <div aria-hidden className="order-first h-16 sm:order-none sm:h-28 sm:pr-4 [&>svg]:h-full [&>svg]:w-auto">
        {art}
      </div>
    </div>
  );
}

/** An empty section inside a screen: it keeps the section's place, says in one ink sentence what will show here, and puts
 *  the next step beside it. `on="panel"` when it sits on a tinted panel (it then takes the white step). */
export function EmptyNote({ children, action, on = "page", className = "" }: { children: React.ReactNode; action?: React.ReactNode; on?: "page" | "panel"; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-3 ${on === "panel" ? "bg-white" : "bg-blue-50"} ${className}`}>
      <p className="min-w-0 flex-1 basis-60 text-[15px] leading-relaxed text-ink">{children}</p>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}
