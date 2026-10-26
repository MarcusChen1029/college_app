// Runs dependent steps one after another and stops at the first one that fails.
// Each step resolves true when it worked. Returns true only when every step did.
export async function runUntilFailure(steps: ReadonlyArray<() => Promise<boolean>>): Promise<boolean> {
  for (const step of steps) {
    if (!(await step())) return false;
  }
  return true;
}
