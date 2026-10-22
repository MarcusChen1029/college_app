// Optimistic concurrency for read-modify-write saves. The website and an AI can edit the same jsonb column
// (checklist, activities…) at the same time; a blind update would silently drop one of the changes. Callers read the
// row with its updated_at, compute the change with a pure rule, and write only if updated_at is still the same.
// Pure: reading and writing are passed in, so it is tested with fakes.

export type Planned<T> = { error: string } | { columns: Record<string, unknown>; value: T };
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export const CONFLICT_MESSAGE = "Your data changed while saving; try again.";
export const MAX_ATTEMPTS = 3;

/**
 * Reads, plans the change, writes. `write` returns false when the row changed since it was read; the loop then
 * re-reads and re-applies the rule, up to `max` attempts. A plan with no columns writes nothing.
 */
export async function modifyWithRetry<R, T>(
  read: () => Promise<R>,
  plan: (current: R) => Planned<T>,
  write: (current: R, columns: Record<string, unknown>) => Promise<boolean>,
  max = MAX_ATTEMPTS,
): Promise<Outcome<T>> {
  for (let attempt = 0; attempt < max; attempt++) {
    const current = await read();
    const planned = plan(current);
    if ("error" in planned) return { ok: false, error: planned.error };
    if (Object.keys(planned.columns).length === 0 || (await write(current, planned.columns))) return { ok: true, value: planned.value };
  }
  return { ok: false, error: CONFLICT_MESSAGE };
}
