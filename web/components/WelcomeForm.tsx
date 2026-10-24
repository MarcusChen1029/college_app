"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { GoogleSignIn } from "@/components/AccountPanel";
import { homePathFor, validateTeacher } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};
const choice = "rounded-2xl border-2 border-zinc-200 p-5 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-60";

/** First sign-in: pick student or teacher/counselor (saved once through the set_my_role RPC). */
export function WelcomeForm() {
  const student = useStudent();
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [asTeacher, setAsTeacher] = useState(false);
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mounted || !student.ready) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;

  if (!student.auth) {
    return (
      <div className="space-y-3">
        <p className="text-zinc-600">Sign in to set up your account as a student or as a teacher/counselor.</p>
        <GoogleSignIn returnTo="/welcome" />
      </div>
    );
  }

  // Role not loaded yet, or already chosen (RoleGate is sending them on).
  if (student.role !== null) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;

  async function save(role: "student" | "teacher", teacher?: { displayName: string; school: string | null }) {
    setBusy(true);
    setError(null);
    const err = await student.setRole(role, teacher);
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    router.push(homePathFor(role));
  }

  function submitTeacher(e: React.FormEvent) {
    e.preventDefault();
    const v = validateTeacher({ displayName: name, school });
    if (!v.ok) return setError(v.error);
    void save("teacher", v.value);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">Signed in as {student.auth.email}. You can only choose once.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" disabled={busy} className={choice} onClick={() => save("student")}>
          <span className="block font-display text-lg font-bold">I&apos;m a student</span>
          <span className="mt-1 block text-sm text-zinc-500">Build my college list, track deadlines and essays.</span>
        </button>
        <button type="button" disabled={busy} className={`${choice} ${asTeacher ? "border-blue-500 bg-blue-50" : ""}`} onClick={() => setAsTeacher(true)}>
          <span className="block font-display text-lg font-bold">I&apos;m a teacher or counselor</span>
          <span className="mt-1 block text-sm text-zinc-500">Support students in a class or one-on-one.</span>
        </button>
      </div>
      {asTeacher && (
        <form onSubmit={submitTeacher} className="space-y-3 rounded-2xl border border-zinc-200 p-5">
          <label className="block text-sm font-medium">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2" placeholder="Ms. Lee" />
          </label>
          <label className="block text-sm font-medium">
            School <span className="font-normal text-zinc-500">(optional)</span>
            <input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2" placeholder="Lincoln High School" />
          </label>
          <button type="submit" disabled={busy} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? "Saving…" : "Continue as teacher"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
