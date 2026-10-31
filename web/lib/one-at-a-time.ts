// Password-moving steps (switching modes, moving passwords into the vault, deleting the old vault, keeping one copy of a
// conflict, starting over) run one at a time per account across every tab of this browser. Two tabs switching at once
// could otherwise each act on what the other just changed: one deletes the vault while the other is still deciding what
// to take back (that lost passwords in a test without the lock).
// - Uses the Web Locks API (navigator.locks: current browsers, and Node for the tests). Where it is missing, or refuses to
//   work (an opaque origin), the step does NOT run: the caller gets its `noLock` result and the page says to update the
//   browser. Saving, showing and clearing one password don't need this lock.
// - A step that stops making progress (a request that hangs) must not keep every other tab waiting: once nothing it does
//   has finished for LOCK_IDLE_MS, it is given up. Its `signal` aborts, the lock is released and the caller gets its
//   `timedOut` result. The step's own promise can't be stopped, so every call it makes goes through a fence
//   (password-mode.ts fencedVault / fencedDevice / fencedWrite) that refuses to start anything once the signal aborted:
//   from then on nothing is deleted or written.
// Not reentrant: a step must never ask for the same lock from inside, or it would wait for itself.

/** The part of LockManager used here. */
export type Locks = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };
/** Why a locked step didn't run (no_locks: this browser can't hold the lock) or was given up (timeout: retry; nothing more was deleted). */
export type LockError = "no_locks" | "timeout";
/** What a locked step gets: `signal` aborts once the step is given up; `progress()` (called by the fences) says it is still moving. */
export type Hold = { readonly signal: AbortSignal; progress(): void };

/** How long a locked step may go without any of its calls finishing before it is given up. */
export const LOCK_IDLE_MS = 60_000;

export const passwordLockName = (userId: string) => `trakur-passwords:${userId}`;

function webLocks(): Locks | null {
  try {
    const locks = (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
}

/** Whether this browser has the lock at all (it may still refuse it on an opaque origin; the step then returns `noLock`). */
export const canLock = (): boolean => webLocks() !== null;

// Runs `step` until it settles or goes `idleMs` without progress; then its signal aborts and `timedOut` is returned.
function withinLimit<T>(step: (hold: Hold) => Promise<T>, timedOut: T, idleMs: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort();
        resolve(timedOut);
      }, idleMs);
    };
    const hold: Hold = {
      signal: controller.signal,
      progress: () => {
        if (!controller.signal.aborted) arm();
      },
    };
    arm();
    let running: Promise<T>;
    try {
      running = step(hold);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
      return;
    }
    // After a time-out the step's result (or error) arrives too late to matter; it is dropped here, never left unhandled.
    running.then(
      (v) => {
        clearTimeout(timer);
        if (!controller.signal.aborted) resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        if (!controller.signal.aborted) reject(e);
      },
    );
  });
}

/**
 * Runs `step` while holding this account's password lock (waits for any other tab's step first). Without the lock it
 * doesn't run and `results.noLock` comes back; a step that went LOCK_IDLE_MS (or `idleMs`) without progress is given up
 * and `results.timedOut` comes back, with the lock released.
 */
export async function oneAtATime<T>(
  userId: string,
  step: (hold: Hold) => Promise<T>,
  results: { noLock: T; timedOut: T },
  opts: { locks?: Locks | null; idleMs?: number } = {},
): Promise<T> {
  const locks = opts.locks === undefined ? webLocks() : opts.locks;
  if (!locks) return results.noLock;
  let ran = false;
  try {
    return await locks.request(passwordLockName(userId), () => {
      ran = true;
      return withinLimit(step, results.timedOut, opts.idleMs ?? LOCK_IDLE_MS);
    });
  } catch (e) {
    if (ran) throw e; // the step's own failure, not the lock's
    return results.noLock; // the lock API is there but refused: never run unserialized
  }
}
