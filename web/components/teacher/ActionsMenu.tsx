"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * One menu entry. `id` must be unique within the menu (labels can repeat). Destructive entries keep their own confirm().
 * `note` is a second, quieter line under the label (for example who will be able to see what the entry creates).
 */
export type MenuAction = { id: string; label: string; note?: string; onSelect: () => void; danger?: boolean };

const BUTTON = "inline-flex items-center justify-center rounded-full text-lg leading-none font-bold disabled:cursor-not-allowed disabled:opacity-50";
const BORDERED = `${BUTTON} size-9 border border-zinc-300 bg-white text-ink hover:border-ink`;
// A control repeated on every row of a list: no outline until it is pointed at, so a column of them stays quiet.
const QUIET = `${BUTTON} size-8 text-zinc-600 hover:bg-zinc-100 hover:text-ink`;

const MENU = "z-30 rounded-xl border-2 border-ink bg-white p-1 shadow-lg";
// What a floating menu needs to decide whether it fits below its button: about this much height per entry, plus padding.
const ROW_ESTIMATE = 64;

type Place = { right: number; top?: number; bottom?: number };

/**
 * A "⋯" button that opens a small menu of actions, so a card or row shows one quiet control instead of a row of equal
 * buttons. Keyboard: Enter/Space/ArrowDown open it on the first item, arrows/Home/End move, Escape closes and returns
 * focus to the button, Tab or a click outside closes it.
 *
 * `quiet`: no border until hovered, for a control repeated down a list. `floating`: the menu is placed against the window
 * (position: fixed, above the button when there is no room below) so a card or table that clips its content
 * (overflow-hidden) cannot cut it off; it closes when the page scrolls or the window resizes, since it would drift away.
 */
export function ActionsMenu({ label, actions, disabled = false, quiet = false, floating = false }: { label: string; actions: MenuAction[]; disabled?: boolean; quiet?: boolean; floating?: boolean }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus({ preventScroll: floating }); // a fixed menu never needs the page to scroll, and a scroll would close it
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const drifted = () => setOpen(false);
    document.addEventListener("mousedown", away);
    if (floating) {
      window.addEventListener("resize", drifted);
      window.addEventListener("scroll", drifted, true); // capture: a scrolling container does not bubble
    }
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", drifted);
      window.removeEventListener("scroll", drifted, true);
    };
  }, [open, floating]);

  if (actions.length === 0) return null;

  function show() {
    const b = floating ? trigger.current?.getBoundingClientRect() : null;
    if (b) {
      const html = document.documentElement; // the visible area: window.inner* would count the scroll bars
      const right = Math.max(8, html.clientWidth - b.right);
      const below = html.clientHeight - b.bottom;
      const above = below < actions.length * ROW_ESTIMATE + 16 && b.top > below; // no room below, and more room above
      setPlace(above ? { right, bottom: html.clientHeight - b.top + 8 } : { right, top: b.bottom + 8 });
    }
    setOpen(true);
  }

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
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            show();
          }
        }}
        className={quiet ? QUIET : BORDERED}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          style={floating && place ? place : undefined}
          className={floating ? `${MENU} fixed w-64 max-w-[calc(100vw-1rem)]` : `${MENU} absolute right-0 top-full mt-2 w-52`}
        >
          {actions.map((a, i) => (
            <button
              key={a.id}
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
              {a.note && <span className="block text-[13px] font-normal text-zinc-600">{a.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
