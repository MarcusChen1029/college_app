// Lets the browser run what is waiting (a tap, a scroll, painting) before the next slice of a long job. Uses scheduler.yield()
// where there is one (the continuation then resumes ahead of other queued work), else a zero-delay timeout.
export function breathe(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise((resolve) => setTimeout(resolve, 0));
}
