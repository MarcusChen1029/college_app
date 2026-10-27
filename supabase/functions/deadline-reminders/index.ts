// Daily deadline reminder digest. Called by pg_cron (see migration 0005) with x-cron-secret.
// Env (Supabase function secrets): RESEND_API_KEY, REMINDER_FROM ("College Tracker <reminders@yourdomain>"),
// APP_URL (e.g. https://college-tracker.vercel.app). Without RESEND_API_KEY it does a dry run.
// Then it sends the opt-in weekly teacher digest (migration 0029, ../_shared/teacher-digest.ts); that part also stays a
// dry run without APP_URL, and a failure there is reported in the response without touching the student reminders.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { isFafsaOnly } from "../_shared/fafsa.ts";
import { renderTeacherDigest, selectDigest, type DigestRow } from "../_shared/teacher-digest.ts";

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
<p style="color:#71717a;font-size:12px">You get these because reminders are on in your College Tracker account. <a href="${appUrl}/settings#reminders">Turn them off</a>.</p>
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

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: authErr } = await db.rpc("check_cron_secret", { secret });
  if (authErr || !ok) return new Response("forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const today: string = body.today ?? new Date().toISOString().slice(0, 10);
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
  const from = Deno.env.get("REMINDER_FROM") ?? "College Tracker <onboarding@resend.dev>";
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

  // Teacher digests are optional: if migration 0029 isn't applied (or anything else fails) student reminders above are unaffected.
  let teacherDigests: DigestResult[] = [];
  let teacherDigestError: string | null = null;
  try {
    // Also dry-run without APP_URL: the email's "turn it off" link must point at the real site.
    teacherDigests = await sendTeacherDigests(db, { today, dryRun: dryRun || !Deno.env.get("APP_URL"), apiKey, from, appUrl });
  } catch (e) {
    teacherDigestError = e instanceof Error ? e.message : String(e);
  }

  return Response.json({ today, dryRun, users: byUser.size, scholarshipError, profileError, results, teacherDigests, teacherDigestError });
});
