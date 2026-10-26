// Weekly teacher digest (roadmap #6): turns teacher_digest_data() rows (migration 0029) into one email.
// Pure and dependency-free so the Edge Function (Deno) and the web unit tests (node --test, web/lib/teacher-digest.test.ts)
// share it. Every student- or teacher-controlled string is HTML-escaped; no link is built from such text.

/** One row of teacher_digest_data(p_teacher, p_today). */
export type DigestRow = {
  student_id: string;
  student_name: string | null;
  item: string; // 'task' | 'deadline'
  title: string | null;
  label: string | null;
  due_on: string; // yyyy-mm-dd
};

export type DigestEntry = { title: string; label: string | null; dueOn: string; days: number };

export type DigestStudent = {
  studentId: string;
  name: string;
  /** Tasks past their due date and not done, oldest first. */
  overdue: DigestEntry[];
  /** Tasks due today or within DIGEST_DAYS and not done. */
  tasksDue: DigestEntry[];
  /** College application deadlines within DIGEST_DAYS, not submitted. */
  deadlines: DigestEntry[];
};

export type DigestEmail = { subject: string; html: string; text: string };

/** How far ahead the digest looks (mirrors the `today + 7` in teacher_digest_data). */
export const DIGEST_DAYS = 7;
/** Rows shown per section per student; the rest are summarised as "and N more". */
export const MAX_PER_SECTION = 8;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whole days from `today` to `date` (both yyyy-mm-dd); negative when `date` is past. */
export function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

const byDue = (a: DigestEntry, b: DigestEntry) => a.days - b.days || a.title.localeCompare(b.title);

/**
 * Groups rows by student and keeps only what the digest is about (re-checked here so a wider query can't widen the email):
 * tasks overdue or due within DIGEST_DAYS, deadlines from today to DIGEST_DAYS. Students with nothing left are dropped.
 */
export function selectDigest(rows: readonly DigestRow[], today: string): DigestStudent[] {
  const byStudent = new Map<string, DigestStudent>();
  for (const r of rows) {
    if (!r || typeof r.due_on !== "string" || !ISO.test(r.due_on) || !r.student_id) continue;
    const days = daysBetween(today, r.due_on);
    if (Number.isNaN(days) || days > DIGEST_DAYS) continue;
    const isTask = r.item === "task";
    if (!isTask && (r.item !== "deadline" || days < 0)) continue;
    let s = byStudent.get(r.student_id);
    if (!s) {
      const name = (r.student_name ?? "").trim() || "Student";
      byStudent.set(r.student_id, (s = { studentId: r.student_id, name, overdue: [], tasksDue: [], deadlines: [] }));
    }
    const entry: DigestEntry = {
      title: (r.title ?? "").trim() || (isTask ? "Task" : "College"),
      label: isTask ? null : (r.label ?? "").trim() || "Application deadline",
      dueOn: r.due_on,
      days,
    };
    (isTask ? (days < 0 ? s.overdue : s.tasksDue) : s.deadlines).push(entry);
  }
  const out = [...byStudent.values()];
  for (const s of out) {
    s.overdue.sort(byDue);
    s.tasksDue.sort(byDue);
    s.deadlines.sort(byDue);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId));
}

export const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "today", "tomorrow", "in 3 days", "yesterday", "4 days ago". */
export function relativeDay(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Section = { heading: string; entries: DigestEntry[]; line: (e: DigestEntry) => string };

function sections(s: DigestStudent): Section[] {
  const all: Section[] = [
    { heading: "Overdue tasks", entries: s.overdue, line: (e) => e.title },
    { heading: "Tasks due this week", entries: s.tasksDue, line: (e) => e.title },
    { heading: "Application deadlines this week (not submitted)", entries: s.deadlines, line: (e) => `${e.title} — ${e.label}` },
  ];
  return all.filter((x) => x.entries.length > 0);
}

/** The digest email, or null when there is nothing to report (then nothing is sent). */
export function renderTeacherDigest(input: { teacherName: string | null; students: readonly DigestStudent[]; appUrl: string }): DigestEmail | null {
  const students = input.students.filter((s) => s.overdue.length + s.tasksDue.length + s.deadlines.length > 0);
  if (!students.length) return null;
  const appUrl = input.appUrl.replace(/\/$/, "");
  const manage = `${appUrl}/settings#digest`;
  const hello = (input.teacherName ?? "").trim();

  const overdueStudents = students.filter((s) => s.overdue.length > 0).length;
  const subject =
    `${plural(students.length, "student")} to check on this week` + (overdueStudents ? ` (${overdueStudents} with overdue tasks)` : "");

  const htmlStudents = students
    .map((s) => {
      const link = `${appUrl}/teacher/students?s=${encodeURIComponent(s.studentId)}`;
      const blocks = sections(s)
        .map((sec) => {
          const shown = sec.entries.slice(0, MAX_PER_SECTION);
          const more = sec.entries.length - shown.length;
          const items = shown
            .map((e) => `<li>${escapeHtml(sec.line(e))} <span style="color:#71717a">· ${escapeHtml(fmtDate(e.dueOn))} (${relativeDay(e.days)})</span></li>`)
            .join("");
          return `<p style="margin:8px 0 2px;font-weight:600">${escapeHtml(sec.heading)}</p>
<ul style="margin:0;padding-left:20px">${items}${more > 0 ? `<li>and ${more} more</li>` : ""}</ul>`;
        })
        .join("\n");
      return `<div style="margin:16px 0;padding-top:8px;border-top:1px solid #e4e4e7">
<a href="${link}" style="font-size:15px;font-weight:700">${escapeHtml(s.name)}</a>
${blocks}
</div>`;
    })
    .join("\n");

  const textStudents = students
    .map((s) => {
      const lines = sections(s).flatMap((sec) => {
        const shown = sec.entries.slice(0, MAX_PER_SECTION);
        const more = sec.entries.length - shown.length;
        return [
          `  ${sec.heading}:`,
          ...shown.map((e) => `  - ${sec.line(e)} (${fmtDate(e.dueOn)}, ${relativeDay(e.days)})`),
          ...(more > 0 ? [`  - and ${more} more`] : []),
        ];
      });
      return `${s.name}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const intro = `${plural(students.length, "of your students has", "of your students have")} tasks or college deadlines that need attention.`;
  return {
    subject,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b">
<p>${hello ? `Hi ${escapeHtml(hello)},` : "Hi,"}</p>
<p>${escapeHtml(intro)} Tasks are ones you assigned that are overdue or due in the next ${DIGEST_DAYS} days and not done; deadlines are college application deadlines in the next ${DIGEST_DAYS} days that haven't been submitted.</p>
${htmlStudents}
<p><a href="${appUrl}/teacher">Open your dashboard</a> · Always confirm dates on the college's own website.</p>
<p style="color:#71717a;font-size:12px">You get this weekly summary because you turned it on in your College Tracker account. <a href="${manage}">Turn it off</a>.</p>
</div>`,
    text: `${hello ? `Hi ${hello},` : "Hi,"}\n\n${intro}\n\n${textStudents}\n\nOpen your dashboard: ${appUrl}/teacher\nTurn this summary off: ${manage}`,
  };
}
