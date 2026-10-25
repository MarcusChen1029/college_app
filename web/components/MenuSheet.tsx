"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { openSignIn } from "@/components/SignInDialog";
import type { NavItem } from "@/lib/roles";
import { buttonClass } from "@/lib/ui";

export type SheetAccount =
  | { kind: "signedIn"; name: string; items: readonly NavItem[]; onSignOut: () => void }
  | { kind: "signedOut"; items: readonly NavItem[]; getStarted: boolean };

const ROW = "flex min-h-12 items-center rounded-lg px-3 text-base text-zinc-700 hover:bg-zinc-100";

/** The phone menu: a modal sheet anchored to the top. Esc, a backdrop click, a link tap and any page change close it. */
export function MenuSheet({
  open,
  onClose,
  items,
  active,
  account,
}: {
  open: boolean;
  onClose: () => void;
  items: readonly NavItem[];
  active: string | null;
  account: SheetAccount;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Any navigation closes the sheet.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (open) onClose();
  }, [pathname, open, onClose]);

  const signIn = () => {
    ref.current?.close(); // close first so two modals never stack
    openSignIn();
  };

  return (
    <dialog
      ref={ref}
      id="site-menu"
      aria-label="Menu"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className="m-0 max-h-dvh w-full max-w-none overflow-y-auto border-b border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg backdrop:bg-black/30"
    >
      <div className="px-4 pb-4">
        <div className="flex h-[69px] items-center justify-between">
          <span className="font-display text-lg font-bold tracking-tight">Menu</span>
          <button type="button" aria-label="Close menu" onClick={() => ref.current?.close()} className="flex size-11 items-center justify-center rounded-lg hover:bg-zinc-100">
            <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav aria-label="Main">
          {items.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={href === active ? "page" : undefined}
              onClick={() => ref.current?.close()}
              className={`${ROW} ${href === active ? "bg-blue-50 font-semibold text-ink" : ""}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="my-2 border-t border-zinc-200" />
        <div className="space-y-0.5">
          {account.kind === "signedIn" && <p className="truncate px-3 py-1 text-sm font-semibold text-zinc-500">{account.name}</p>}
          {account.items.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => ref.current?.close()} className={ROW}>
              {label}
            </Link>
          ))}
          {account.kind === "signedIn" ? (
            <button
              type="button"
              className={`${ROW} w-full text-left`}
              onClick={() => {
                ref.current?.close();
                account.onSignOut();
              }}
            >
              Sign out
            </button>
          ) : (
            <div className="flex items-center gap-3 px-3 pt-2">
              <button type="button" onClick={signIn} className={`${buttonClass("secondary", "md")} min-h-11`}>
                Sign in
              </button>
              {account.getStarted && (
                <Link href="/start" onClick={() => ref.current?.close()} className={`${buttonClass("primary", "md")} min-h-11`}>
                  Get started
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
