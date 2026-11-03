// Daily deadline reminder digest. Called by pg_cron (see migration 0005) with x-cron-secret.
// Env (Supabase function secrets): RESEND_API_KEY, REMINDER_FROM ("Trakur <reminders@yourdomain>"),
// APP_URL (e.g. https://college-tracker.vercel.app). Without RESEND_API_KEY it does a dry run.
// Then it sends the opt-in weekly student summary (migration 0051, ../_shared/student-digest.ts) and the opt-in weekly teacher
// digest (migration 0029, ../_shared/teacher-digest.ts); both also stay a dry run without APP_URL, and a failure in either is
// reported in the response without touching the student reminders or the other digest.
// DEPLOY: this file uploads with every ../_shared file it imports: fafsa.ts, pass.ts, teacher-digest.ts and student-digest.ts.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { isFafsaOnly } from "../_shared/fafsa.ts";
import {
  clampTaipeiToday,
  runStudentDigests,
  toDigestCollege,
  type CollegeRow,
  type DigestDeps,
  type DueStudent,
  type SharedData,
  type StudentDigestResult,
} from "../_shared/student-digest.ts";
import { clampToday, renderTeacherDigest, selectDigest, type DigestRow } from "../_shared/teacher-digest.ts";

type Due = {
  user_id: string;
  email: string;
  deadline_id: string;
  days_before: number;
  due_date: string;
  college_name: string;
  college_slug: string;
  deadline_label: string;
  kind: string;
  plan_key: string | null;
};

// From due_scholarship_reminders() (migration 0027): the student's own scholarships still being considered or applied to.
type ScholarshipDue = {
  user_id: string;
  email: string;
  scholarship_id: string;
  days_before: number;
  due_date: string;
  name: string;
  provider: string | null;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const when = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

const dateCell = (iso: string, days: number) =>
  `<td style="padding:6px 12px 6px 0"><strong>${esc(fmt(iso))}</strong><br><span style="color:#b91c1c">${when(days)}</span></td>`;

function render(items: Due[], scholarships: ScholarshipDue[], appUrl: string) {
  const parts: string[] = [];
  const texts: string[] = [];
  if (items.length) {
    const rows = items
      .map((d) => `<tr>
  ${dateCell(d.due_date, d.days_before)}
  <td style="padding:6px 0"><a href="${appUrl}/colleges/${d.college_slug}">${esc(d.college_name)}</a><br>${esc(d.deadline_label)}</td>
</tr>`)
      .join("");
    parts.push(`<p>Upcoming deadlines for colleges on your list:</p>
<table>${rows}</table>
<p><a href="${appUrl}/application/list">Open my list</a> · Always confirm dates on the college's own website.</p>`);
    const text = items.map((d) => `- ${fmt(d.due_date)} (${when(d.days_before)}): ${d.college_name} — ${d.deadline_label}`).join("\n");
    texts.push(`Upcoming deadlines for colleges on your list:\n\n${text}\n\nOpen my list: ${appUrl}/application/list`);
  }
  if (scholarships.length) {
    // Student-entered text: escaped in HTML, and no links built from it.
    const rows = scholarships
      .map((s) => `<tr>
  ${dateCell(s.due_date, s.days_before)}
  <td style="padding:6px 0"><strong>${esc(s.name)}</strong>${s.provider ? `<br>${esc(s.provider)}` : ""}</td>
</tr>`)
      .join("");
    parts.push(`<h3 style="font-size:15px;margin:20px 0 4px">Scholarships</h3>
<p>Deadlines for scholarships you added and are still considering or applying to:</p>
<table>${rows}</table>
<p><a href="${appUrl}/application/scholarships">Open my scholarships</a> · Always confirm dates with the scholarship provider.</p>`);
    const text = scholarships.map((s) => `- ${fmt(s.due_date)} (${when(s.days_before)}): ${s.name}${s.provider ? ` (${s.provider})` : ""}`).join("\n");
    texts.push(`Scholarships:\n\n${text}\n\nOpen my scholarships: ${appUrl}/application/scholarships`);
  }
  const n = items.length + scholarships.length;
  const subject =
    n === 1
      ? items.length
        ? `${items[0].college_name}: ${items[0].deadline_label} ${when(items[0].days_before)}`
        : `Scholarship: ${scholarships[0].name} due ${when(scholarships[0].days_before)}`
      : !scholarships.length
        ? `${n} college deadlines coming up`
        : !items.length
          ? `${n} scholarship deadlines coming up`
          : `${n} deadlines coming up`;
  return {
    subject,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b">
${parts.join("\n")}
<p style="color:#71717a;font-size:12px">You get these because reminders are on in your Trakur account. <a href="${appUrl}/settings#reminders">Turn them off</a>.</p>
</div>`,
    text: `${texts.join("\n\n")}\nTurn reminders off: ${appUrl}/settings#reminders`,
  };
}

type DigestResult = { teacher: string; count: number; status: string };

// Opt-in weekly teacher digest (migration 0029). Runs after the student reminders; the caller catches any throw so a
// digest problem never affects student emails. The data comes only from service_role SQL functions, never student tables.
async function sendTeacherDigests(
  db: SupabaseClient,
  opts: { today: string; dryRun: boolean; apiKey: string | undefined; from: string; appUrl: string },
): Promise<DigestResult[]> {
  const { data: teachers, error } = await db.rpc("due_teacher_digests", { p_today: opts.today });
  if (error) throw new Error(`due_teacher_digests: ${error.message}`);
  const results: DigestResult[] = [];
  for (const t of (teachers ?? []) as { teacher_id: string; email: string; teacher_name: string | null }[]) {
    const { data: rows, error: rowsErr } = await db.rpc("teacher_digest_data", { p_teacher: t.teacher_id, p_today: opts.today });
    if (rowsErr) {
      results.push({ teacher: t.teacher_id, count: 0, status: `data failed: ${rowsErr.message}` });
      continue;
    }
    const students = selectDigest((rows ?? []) as DigestRow[], opts.today);
    const email = renderTeacherDigest({ teacherName: t.teacher_name, students, appUrl: opts.appUrl });
    // Nothing to report: send nothing and log nothing, so the teacher is checked again tomorrow.
    if (!email) continue;
    if (opts.dryRun) {
      results.push({ teacher: t.teacher_id, count: students.length, status: `dry-run: ${email.subject}` });
      continue;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `teacher-digest-${t.teacher_id}-${opts.today}` },
      body: JSON.stringify({ from: opts.from, to: [t.email], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) {
      results.push({ teacher: t.teacher_id, count: students.length, status: `send failed ${res.status}: ${(await res.text()).slice(0, 200)}` });
      continue;
    }
    const { error: logErr } = await db.from("teacher_digest_log").upsert({ teacher_id: t.teacher_id, sent_on: opts.today }, { ignoreDuplicates: true });
    results.push({ teacher: t.teacher_id, count: students.length, status: logErr ? `sent, log failed: ${logErr.message}` : "sent" });
  }
  return results;
}

// PostgREST answers at most 1000 rows per request (the website pages its bulk reads the same way, web/lib/data.ts allRows), and the
// deadlines table is past that. Each `page` must order by a unique key so pages neither overlap nor skip rows.
const PAGE = 1000;
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

// Opt-in weekly student summary (migration 0051). The rules and the email are in ../_shared/student-digest.ts (tested with fakes);
// this only does the reads, the Resend call and the log row. Runs after the student reminders; the caller catches any throw so a
// summary problem never affects those emails. Reads use the service role, exactly the tables the website's AI tool reads for the
// same answer: the student's listed colleges, the reference deadlines (every cycle, like web getDeadlines) and source dates.
async function sendStudentDigests(
  db: SupabaseClient,
  opts: { today: string; dryRun: boolean; apiKey: string | undefined; from: string; appUrl: string },
): Promise<StudentDigestResult[]> {
  const deps: DigestDeps = {
    async dueStudents(today) {
      const { data, error } = await db.rpc("due_student_digests", { p_today: today });
      if (error) throw new Error(`due_student_digests: ${error.message}`);
      return (data ?? []) as DueStudent[];
    },
    async sharedData(since) {
      const [deadlines, sources, plans] = await Promise.all([
        allRows(
          (from, to) => db.from("deadlines").select("id, institution_id, kind, plan_key, label, due_date").order("due_date", { nullsFirst: false }).order("id").range(from, to),
          "deadlines",
        ),
        // Only the rows from the window start on: an older newest date is not "re-checked this week" anyway.
        allRows((from, to) => db.from("sources").select("id, institution_id, accessed_on").gte("accessed_on", since).order("id").range(from, to), "sources"),
        db.from("application_plans").select("key, label"),
      ]);
      if (plans.error) throw new Error(`application_plans: ${plans.error.message}`);
      return {
        deadlines: deadlines as unknown as SharedData["deadlines"],
        sources: sources as unknown as SharedData["sources"],
        plans: (plans.data ?? []) as SharedData["plans"],
      };
    },
    async studentData(userId) {
      const [profile, rows] = await Promise.all([
        db.from("student_profiles").select("is_international").eq("user_id", userId).maybeSingle(),
        allRows(
          (from, to) =>
            db
              .from("student_colleges")
              .select("id, institution_id, plan_key, status, checklist, updated_at, institutions(slug, name, short_name)")
              .eq("user_id", userId)
              .not("institution_id", "is", null)
              .order("created_at")
              .order("id")
              .range(from, to),
          "student_colleges",
        ),
      ]);
      if (profile.error) throw new Error(`student_profiles: ${profile.error.message}`);
      const list = (rows as unknown as CollegeRow[]).flatMap((r) => {
        const c = toDigestCollege(r);
        return c ? [c] : [];
      });
      return { international: !!(profile.data as { is_international?: boolean } | null)?.is_international, list };
    },
    async send(m) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
        body: JSON.stringify({ from: opts.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      });
      return res.ok ? { ok: true } : { ok: false, status: res.status, body: (await res.text()).slice(0, 200) };
    },
    // One row per student per week, written only after a send Resend accepted; weekStart is the value due_student_digests returned.
    async markSent(userId, weekStart) {
      const { error } = await db.from("student_digest_log").upsert({ user_id: userId, week_start: weekStart }, { onConflict: "user_id,week_start", ignoreDuplicates: true });
      return error ? error.message : null;
    },
  };
  return runStudentDigests(deps, { today: opts.today, dryRun: opts.dryRun, appUrl: opts.appUrl });
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: authErr } = await db.rpc("check_cron_secret", { secret });
  if (authErr || !ok) return new Response("forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  // A replayed or leaked secret must not be able to mail reminders for arbitrary dates, or push the digest log ahead.
  const today = clampToday(body?.today);
  const { data, error } = await db.rpc("due_reminders", { today });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Scholarship reminders are optional: if migration 0027 isn't applied the RPC errors and college reminders still go out.
  const sch = await db.rpc("due_scholarship_reminders", { today });
  const scholarshipError = sch.error?.message ?? null;

  type Digest = { email: string; colleges: Due[]; scholarships: ScholarshipDue[] };
  const byUser = new Map<string, Digest>();
  const digest = (userId: string, email: string) => {
    let g = byUser.get(userId);
    if (!g) byUser.set(userId, (g = { email, colleges: [], scholarships: [] }));
    return g;
  };
  for (const d of (data ?? []) as Due[]) digest(d.user_id, d.email).colleges.push(d);
  for (const s of (sch.data ?? []) as ScholarshipDue[]) digest(s.user_id, s.email).scholarships.push(s);

  // International students can't file FAFSA, so FAFSA-only dates are dropped from their digest (same rule as the web
  // app, web/lib/deadline-rules.ts). If the lookup fails, everything is sent as before and the error is reported.
  let profileError: string | null = null;
  if (byUser.size) {
    const profiles = await db.from("student_profiles").select("user_id, is_international").in("user_id", [...byUser.keys()]);
    profileError = profiles.error?.message ?? null;
    const intl = new Set(((profiles.data ?? []) as { user_id: string; is_international: boolean }[]).filter((p) => p.is_international).map((p) => p.user_id));
    for (const [userId, g] of byUser) {
      if (!intl.has(userId)) continue;
      g.colleges = g.colleges.filter((d) => d.kind === "application" || !isFafsaOnly(d.deadline_label));
      if (!g.colleges.length && !g.scholarships.length) byUser.delete(userId);
    }
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_FROM") ?? "Trakur <onboarding@resend.dev>";
  const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  const dryRun = !apiKey || body.dryRun === true;

  const results: { user: string; count: number; status: string }[] = [];
  for (const [userId, { email: to, colleges: items, scholarships }] of byUser) {
    const email = render(items, scholarships, appUrl);
    const count = items.length + scholarships.length;
    if (dryRun) {
      results.push({ user: userId, count, status: `dry-run: ${email.subject}` });
      continue;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `${userId}-${today}` },
      body: JSON.stringify({ from, to: [to], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) {
      results.push({ user: userId, count, status: `send failed ${res.status}: ${(await res.text()).slice(0, 200)}` });
      continue;
    }
    const logErrors: string[] = [];
    if (items.length) {
      const { error: logErr } = await db
        .from("reminder_log")
        .upsert(items.map((d) => ({ user_id: userId, deadline_id: d.deadline_id, days_before: d.days_before })), { ignoreDuplicates: true });
      if (logErr) logErrors.push(logErr.message);
    }
    if (scholarships.length) {
      const { error: logErr } = await db
        .from("scholarship_reminder_log")
        .upsert(scholarships.map((s) => ({ user_id: userId, scholarship_id: s.scholarship_id, due_date: s.due_date, days_before: s.days_before })), { ignoreDuplicates: true });
      if (logErr) logErrors.push(logErr.message);
    }
    results.push({ user: userId, count, status: logErrors.length ? `sent, log failed: ${logErrors.join("; ")}` : "sent" });
  }

  // The weekly student summary is optional too: if migration 0051 isn't applied (or anything else fails) the reminders above and the
  // teacher digest below are unaffected. Its day is the Taipei date, because the week it logs starts on a Taipei Monday.
  const studentToday = clampTaipeiToday(body?.today);
  let studentDigests: StudentDigestResult[] = [];
  let studentDigestError: string | null = null;
  try {
    // Also dry-run without APP_URL: the email's "turn it off" link must point at the real site.
    studentDigests = await sendStudentDigests(db, { today: studentToday, dryRun: dryRun || !Deno.env.get("APP_URL"), apiKey, from, appUrl });
  } catch (e) {
    studentDigestError = e instanceof Error ? e.message : String(e);
  }

  // Teacher digests are optional: if migration 0029 isn't applied (or anything else fails) student reminders above are unaffected.
  let teacherDigests: DigestResult[] = [];
  let teacherDigestError: string | null = null;
  try {
    // Also dry-run without APP_URL: the email's "turn it off" link must point at the real site.
    teacherDigests = await sendTeacherDigests(db, { today, dryRun: dryRun || !Deno.env.get("APP_URL"), apiKey, from, appUrl });
  } catch (e) {
    teacherDigestError = e instanceof Error ? e.message : String(e);
  }

  return Response.json({ today, studentToday, dryRun, users: byUser.size, scholarshipError, profileError, results, studentDigests, studentDigestError, teacherDigests, teacherDigestError });
});
