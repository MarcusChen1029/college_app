"use client";

import { useEffect, useRef } from "react";

// Pop-up over the page with a blurred backdrop. Opens on mount; Esc, ✕ or a click outside closes it.
export function Modal({
  title,
  onClose,
  className = "w-[min(48rem,calc(100vw-2rem))]",
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // No close() on cleanup: it would fire onClose (React re-runs effects in dev), and unmounting removes the dialog anyway.
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`m-auto max-h-[90vh] overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm ${className}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      {/* Focus the panel itself on open, so the first link/input doesn't show a focus ring. */}
      <div className="flex max-h-[90vh] flex-col outline-none" tabIndex={-1} autoFocus>
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button className="text-zinc-400 hover:text-zinc-700" onClick={() => ref.current?.close()} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}
