"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { homePathFor, roleChangeMessage, validateTeacher } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const btn = buttonClass("secondary", "sm");
const field = "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2";

/** Settings page control to switch between a student and a teacher/counselor account. Shown only to signed-in users with a role. */
export function RoleSwitcher() {
  const student = useStudent();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = student.role;
  if (!student.auth || (role !== "student" && role !== "teacher")) return null;

  async function switchTo(next: "student" | "teacher", teacher?: { displayName: string; school: string | null }) {
    setBusy(true);
    setError(null);
    const err = await student.changeRole(next, teacher);
    if (err) {
      setError(roleChangeMessage(err));
      setBusy(false);
      return;
    }
    router.push(homePathFor(next));
  }

  function toTeacher(e: React.FormEvent) {
    e.preventDefault();
    const v = validateTeacher({ displayName: name, school });
    if (!v.ok) return setError(v.error);
    void switchTo("teacher", v.value);
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 p-5" aria-labelledby="role-heading">
      <h3 id="role-heading" className="font-display text-lg font-bold">
        Account type
      </h3>
      {role === "student" ? (
        <>
          <p className="text-sm text-zinc-600">This is a student account. If you are a teacher or counselor, you can switch; your student list and profile are kept in case you switch back.</p>
          {!open ? (
            <button type="button" className={btn} onClick={() => setOpen(true)}>
              Switch to a teacher or counselor account
            </button>
          ) : (
            <form onSubmit={toTeacher} className="space-y-3">
              <label className="block text-sm font-medium">
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Ms. Lee" />
              </label>
              <label className="block text-sm font-medium">
                School <span className="font-normal text-zinc-500">(optional)</span>
                <input value={school} onChange={(e) => setSchool(e.target.value)} className={field} placeholder="Lincoln High School" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
                  {busy ? "Switching…" : "Switch to teacher"}
                </button>
                <button type="button" disabled={busy} className={btn} onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            This is a teacher or counselor account. To switch to a student account, first remove all your linked students. Switching turns off all your join codes and archives your classes.
          </p>
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() => confirm("Switch to a student account? Your join codes will be turned off and your classes archived.") && void switchTo("student")}
          >
            {busy ? "Switching…" : "Switch to a student account"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
    </section>
  );
}
