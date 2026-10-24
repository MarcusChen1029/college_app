import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Help" };

const link = "font-semibold text-blue-700 underline underline-offset-4";

export default function HelpPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-display text-3xl font-bold">Help</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Where do my account details live?</h2>
        <p className="text-zinc-600">
          Click your username at the top right. <strong>Profile</strong> is your scores and list summary, <strong>Settings</strong> holds your
          email, account type and the student/teacher switch, and <strong>Sign out</strong> ends your session.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Where does the data come from?</h2>
        <p className="text-zinc-600">
          Every number on a college page comes from an official source (Common Data Set, the college&apos;s own admissions or financial-aid
          pages) and links back to it. If something could not be confirmed it is left blank rather than guessed.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Sharing my list with a teacher or counselor</h2>
        <p className="text-zinc-600">
          Your teacher gives you a class code or a personal code. Enter it under <strong>My counselors and teachers</strong> in{" "}
          <Link href="/profile#account" className={link}>
            Settings
          </Link>
          . You can leave at any time.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Teacher and counselor accounts</h2>
        <p className="text-zinc-600">
          Create classes and join codes on the Classes page, then follow your students on the Students and Deadlines pages. You can switch
          between student and teacher in Settings once no students or teachers are linked.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Deadline reminders</h2>
        <p className="text-zinc-600">
          Signed-in students can get email reminders 14, 3 and 1 days before each deadline on their list. Turn them on or off under the
          calendar on your{" "}
          <Link href="/profile" className={link}>
            Profile
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
