// Password-moving steps (switching modes, moving passwords into the vault, deleting the old vault, keeping one copy of a
// conflict) run one at a time per account across every tab of this browser. Two tabs switching at once could otherwise
// each act on what the other just changed: one deletes the vault while the other is still deciding what to take back.
// Uses the Web Locks API (navigator.locks: current browsers, and Node for the tests); where it is missing, or refuses to
// work (an opaque origin), the step just runs. Not reentrant: a step must never ask for the same lock from inside, or it
// would wait for itself.

/** The part of LockManager used here. */
export type Locks = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };

export const passwordLockName = (userId: string) => `trakur-passwords:${userId}`;

function webLocks(): Locks | null {
  try {
    const locks = (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
}

/** Runs `step` while holding this account's password lock (waits for any other tab's step first). */
export async function oneAtATime<T>(userId: string, step: () => Promise<T>, locks: Locks | null = webLocks()): Promise<T> {
  if (!locks) return step();
  let ran = false;
  try {
    return await locks.request(passwordLockName(userId), () => {
      ran = true;
      return step();
    });
  } catch (e) {
    if (ran) throw e; // the step's own failure, not the lock's
    return step(); // the lock API is there but refused: run without it
  }
}
