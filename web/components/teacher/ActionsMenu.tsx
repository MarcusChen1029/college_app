"use client";

import { useEffect, useId, useRef, useState } from "react";

/** One menu entry. Destructive entries keep their own confirm() inside onSelect. */
export type MenuAction = { label: string; onSelect: () => void; danger?: boolean };

/**
 * A "⋯" button that opens a small menu of actions, so a card or row shows one quiet control instead of a row of equal
 * buttons. Keyboard: Enter/Space/ArrowDown open it on the first item, arrows/Home/End move, Escape closes and returns
 * focus to the button, Tab or a click outside closes it.
 */
export function ActionsMenu({ label, actions, disabled = false }: { label: string; actions: MenuAction[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  if (actions.length === 0) return null;

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const last = list.length - 1;
    const to = e.key === "ArrowDown" ? (i >= last ? 0 : i + 1) : e.key === "ArrowUp" ? (i <= 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (to !== null) {
      e.preventDefault();
      list[to]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-300 bg-white text-lg leading-none font-bold text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKey} className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border-2 border-ink bg-white p-1 shadow-lg">
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true);
                a.onSelect();
              }}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none ${a.danger ? "text-urgent" : "text-ink"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
