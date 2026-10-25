// Daily deadline reminder digest. Called by pg_cron (see migration 0005) with x-cron-secret.
// Env (Supabase function secrets): RESEND_API_KEY, REMINDER_FROM ("College Tracker <reminders@yourdomain>"),
// APP_URL (e.g. https://college-tracker.vercel.app). Without RESEND_API_KEY it does a dry run.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const when = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

function render(items: Due[], appUrl: string) {
  const rows = items
    .map(
      (d) => `<tr>
  <td style="padding:6px 12px 6px 0"><strong>${esc(fmt(d.due_date))}</strong><br><span style="color:#b91c1c">${when(d.days_before)}</span></td>
  <td style="padding:6px 0"><a href="${appUrl}/colleges/${d.college_slug}">${esc(d.college_name)}</a><br>${esc(d.deadline_label)}</td>
</tr>`,
    )
    .join("");
  const text = items.map((d) => `- ${fmt(d.due_date)} (${when(d.days_before)}): ${d.college_name} — ${d.deadline_label}`).join("\n");
  const n = items.length;
  return {
    subject: n === 1 ? `${items[0].college_name}: ${items[0].deadline_label} ${when(items[0].days_before)}` : `${n} college deadlines coming up`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b">
<p>Upcoming deadlines for colleges on your list:</p>
<table>${rows}</table>
<p><a href="${appUrl}/application/list">Open my list</a> · Always confirm dates on the college's own website.</p>
<p style="color:#71717a;font-size:12px">You get these because reminders are on in your College Tracker account. <a href="${appUrl}/settings#reminders">Turn them off</a>.</p>
</div>`,
    text: `Upcoming deadlines for colleges on your list:\n\n${text}\n\nOpen my list: ${appUrl}/application/list\nTurn reminders off: ${appUrl}/settings#reminders`,
  };
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

  const byUser = new Map<string, Due[]>();
  for (const d of (data ?? []) as Due[]) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d]);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_FROM") ?? "College Tracker <onboarding@resend.dev>";
  const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  const dryRun = !apiKey || body.dryRun === true;

  const results: { user: string; count: number; status: string }[] = [];
  for (const [userId, items] of byUser) {
    const email = render(items, appUrl);
    if (dryRun) {
      results.push({ user: userId, count: items.length, status: `dry-run: ${email.subject}` });
      continue;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `${userId}-${today}` },
      body: JSON.stringify({ from, to: [items[0].email], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) {
      results.push({ user: userId, count: items.length, status: `send failed ${res.status}: ${(await res.text()).slice(0, 200)}` });
      continue;
    }
    const { error: logErr } = await db
      .from("reminder_log")
      .upsert(items.map((d) => ({ user_id: userId, deadline_id: d.deadline_id, days_before: d.days_before })), { ignoreDuplicates: true });
    results.push({ user: userId, count: items.length, status: logErr ? `sent, log failed: ${logErr.message}` : "sent" });
  }

  return Response.json({ today, dryRun, users: byUser.size, results });
});
