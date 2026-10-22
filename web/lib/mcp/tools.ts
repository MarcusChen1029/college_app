import "server-only";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CA_LIMITS, UC_LIMITS } from "../activities";
import { buildContextPack, detailSection } from "../ai-context";
import { stage } from "../application";
import { CHECKLIST, isDone, progress, type Checklist } from "../checklist";
import { getCollege, getDeadlines, getLookups, getSummaries } from "../data";
import { computeFit, FIT_LABEL, type StudentProfile } from "../fit";
import { getPlan, listLimit } from "../plans";
import { REGIONS } from "../regions";
import { DEFAULT_OPTIONS, EMPTY_HEADER } from "../resume";
import {
  COLLEGE_COLUMNS_NO_LOGINS,
  PROFILE_COLUMNS_NO_LOGINS,
  toEntry,
  toProfile,
  type CollegeRow,
  type ListEntry,
  type ProfileRow,
} from "../student-rows";
import type { CollegeSummary, Lookups } from "../types";
import { userClient } from "./auth";
import { modifyWithRetry, type Outcome, type Planned } from "./concurrency";
import type { McpAuth } from "./claims";
import {
  ACTIVITY_KINDS,
  addActivity,
  addEssay,
  AI_STATUSES,
  applyProfilePatch,
  applyResumePatch,
  checkAddCollege,
  checkPlanKey,
  checkSetInterested,
  checkStatusChange,
  deleteActivity,
  edWarnings,
  isSenior,
  NOTES_MAX,
  normalizeActivities,
  patchChecklist,
  seniorOnlyMessage,
  updateActivity,
  updateEssay,
  upcomingDeadlines,
} from "./rules";

// Every tool acts as the signed-in student through a client carrying their token, so row-level
// security limits what any query can touch. Student tables are always read with the explicit
// *_NO_LOGINS column lists, never "*", and nothing here writes the saved-login columns.

type Student = { db: SupabaseClient; userId: string; origin: string; profile: StudentProfile };
type Handler<A> = (s: Student, args: A) => Promise<CallToolResult>;

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });
const json = (v: unknown): CallToolResult => text(JSON.stringify(v, null, 2));
const toolError = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });
/** Wraps a tool: finds the student from the token, enforces the Senior plan, and turns thrown errors into tool errors. */
function guarded<A>(handler: Handler<A>) {
  return async (args: A, ctx: ServerContext): Promise<CallToolResult> => {
    const auth = ctx.http?.authInfo as (McpAuth & { extra?: McpAuth["extra"] }) | undefined;
    if (!auth?.extra?.userId) return toolError("Not signed in. Reconnect the connector and approve access.");
    try {
      const db = userClient(auth.token);
      const { data, error } = await db.from("student_profiles").select(PROFILE_COLUMNS_NO_LOGINS).eq("user_id", auth.extra.userId).maybeSingle();
      if (error) return toolError(`Couldn't load the student's profile: ${error.message}`);
      const profile = toProfile((data ?? { plan: "free" }) as ProfileRow);
      if (!isSenior(profile.plan)) return toolError(seniorOnlyMessage(auth.extra.origin));
      return await handler({ db, userId: auth.extra.userId, origin: auth.extra.origin, profile }, args);
    } catch (e) {
      return toolError(`Something went wrong: ${(e as Error).message}`);
    }
  };
}

async function readList(s: Student): Promise<ListEntry[]> {
  const { data, error } = await s.db.from("student_colleges").select(COLLEGE_COLUMNS_NO_LOGINS).eq("user_id", s.userId).order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CollegeRow[]).map(toEntry);
}

const check = (error: { message: string } | null, what: string) => {
  if (error) throw new Error(`Couldn't save ${what}: ${error.message}`);
};

/** Turns a change outcome into the tool result: the value as JSON, or the reason as a tool error. */
const reply = <T,>(o: Outcome<T>): CallToolResult => (o.ok ? json(o.value) : toolError(o.error));

/**
 * Read-modify-write on the student's profile row. The write only lands if updated_at is unchanged since the read
 * (see concurrency.ts); `plan` is a pure rule applied to the freshly read profile.
 */
function changeProfile<T>(s: Student, plan: (profile: StudentProfile) => Planned<T>): Promise<Outcome<T>> {
  return modifyWithRetry(
    async () => {
      const { data, error } = await s.db.from("student_profiles").select(`${PROFILE_COLUMNS_NO_LOGINS}, updated_at`).eq("user_id", s.userId).maybeSingle();
      if (error) throw new Error(`Couldn't load the profile: ${error.message}`);
      const row = data as unknown as (ProfileRow & { updated_at: string }) | null;
      if (!row) throw new Error("No profile found.");
      return { profile: toProfile(row), version: row.updated_at };
    },
    ({ profile }) => plan(profile),
    async ({ version }, columns) => {
      const { data, error } = await s.db.from("student_profiles").update(columns).eq("user_id", s.userId).eq("updated_at", version).select("updated_at");
      check(error, "the profile");
      return (data ?? []).length > 0;
    },
  );
}

/** Same for one listed college's row; `plan` also sees the whole list (for warnings). A college that isn't listed is an error. */
function changeEntry<T>(s: Student, slug: string, plan: (entry: ListEntry, list: ListEntry[]) => Planned<T>): Promise<Outcome<T>> {
  return modifyWithRetry(
    async () => {
      const { data, error } = await s.db.from("student_colleges").select(`${COLLEGE_COLUMNS_NO_LOGINS}, updated_at`).eq("user_id", s.userId).order("created_at");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as (CollegeRow & { updated_at: string })[];
      return { list: rows.map(toEntry), versions: new Map(rows.map((r) => [r.institution_id, r.updated_at])) };
    },
    ({ list }) => {
      const entry = list.find((e) => e.slug === slug);
      return entry ? plan(entry, list) : { error: notListedText(slug) };
    },
    async ({ list, versions }, columns) => {
      const entry = list.find((e) => e.slug === slug)!;
      const { data, error } = await s.db
        .from("student_colleges")
        .update(columns)
        .eq("user_id", s.userId)
        .eq("institution_id", entry.institutionId)
        .eq("updated_at", versions.get(entry.institutionId) ?? "")
        .select("updated_at");
      check(error, slug);
      return (data ?? []).length > 0;
    },
  );
}

const profileColumns = (p: StudentProfile) => ({
  sat_total: p.sat ?? null,
  act_composite: p.act ?? null,
  gpa_unweighted: p.gpa ?? null,
  is_international: !!p.international,
  target_regions: p.targetRegions ?? [],
  test_details: p.tests ?? {},
});

const nameOf = (c: CollegeSummary) => c.short_name ?? c.name;

function findSummary(summaries: CollegeSummary[], slug: string) {
  return summaries.find((c) => c.slug === slug);
}

const notFound = (slug: string) => toolError(`No college with slug "${slug}". Use search_colleges to find the right slug.`);
const notListedText = (slug: string) => `${slug} isn't on the student's list. Use add_college first, or get_applications to see what is listed.`;

/** One listed college as the AI sees it: checklist detail, next deadline and rough fit, no logins and no database ids. */
function describe(entry: ListEntry, college: CollegeSummary | undefined, s: Student, deadlines: Awaited<ReturnType<typeof getDeadlines>>, lookups: Lookups) {
  const c: Checklist = entry.checklist;
  const hasScores = s.profile.sat != null || s.profile.act != null;
  const fit = college && hasScores ? computeFit(s.profile, college) : null;
  const next = college ? upcomingDeadlines([{ slug: entry.slug, name: nameOf(college), id: college.id, plan: entry.plan }], deadlines)[0] : undefined;
  const p = progress(c);
  return {
    slug: entry.slug,
    name: college ? nameOf(college) : entry.slug,
    plan: entry.plan,
    planLabel: entry.plan ? lookups.plans.find((x) => x.key === entry.plan)?.label ?? entry.plan : null,
    offeredPlans: college?.plans ?? [],
    status: entry.status,
    stage: stage(entry.status, c),
    checklist: {
      progress: `${p.done}/${p.total}`,
      essays: { done: isDone("essays", c), noEssaysNeeded: !!c.no_essays, list: (c.essay_list ?? []).map((e) => ({ id: e.id, title: e.title, url: e.url || null, status: e.status })) },
      recommendations: isDone("recommendations", c),
      transcript: isDone("transcript", c),
      test_scores: { done: isDone("test_scores", c), plan: c.test_plan ?? null },
      english_test: { done: isDone("english_test", c), plan: c.english_plan ?? null },
    },
    notes: entry.notes || null,
    nextDeadline: next ? { date: next.due_date, in_days: next.days, label: next.label ?? next.kind.replace(/_/g, " "), plan: next.plan_key } : null,
    fit: fit ? { label: FIT_LABEL[fit.fit], reason: fit.reason, note: "rough estimate" } : null,
  };
}

async function applications(s: Student) {
  const [list, summaries, deadlines, lookups] = await Promise.all([readList(s), getSummaries(), getDeadlines(), getLookups()]);
  return { list, summaries, deadlines, lookups, items: list.map((e) => describe(e, findSummary(summaries, e.slug), s, deadlines, lookups)) };
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const score = z.number().nullable().optional();
const sections = z.record(z.string(), z.number().nullable());

export function registerTools(server: McpServer) {
  // ── Read ──

  server.registerTool(
    "get_profile",
    {
      title: "Get student profile",
      description: "The student's GPA (unweighted, 4.0 scale), SAT/ACT scores with sections, English test scores, international status, target regions and plan. Saved logins are never included.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    guarded(async ({ profile }) => {
      const t = profile.tests ?? {};
      return json({
        gpa: profile.gpa ?? null,
        sat: { total: profile.sat ?? null, sections: t.sat ?? {} },
        act: { composite: profile.act ?? null, sections: t.act ?? {} },
        english: t.english ?? {},
        international: !!profile.international,
        targetRegions: profile.targetRegions ?? [],
        plan: getPlan(profile.plan).key,
      });
    }),
  );

  server.registerTool(
    "get_applications",
    {
      title: "Get applications",
      description:
        "Every college on the student's list with application plan (ED/EA/RD…), status, checklist (essays with ids, titles, links and status), notes, next deadline and a rough reach/target/safety label, plus colleges marked interested.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    guarded(async (s) => {
      const a = await applications(s);
      return json({ listLimit: listLimit(s.profile.plan), applications: a.items, interested: s.profile.interested ?? [] });
    }),
  );

  server.registerTool(
    "get_upcoming_deadlines",
    {
      title: "Get upcoming deadlines",
      description: "Deadlines for colleges on the student's list within the next N days, soonest first. Once the student picked an application plan for a college, only that plan's application deadline is shown.",
      inputSchema: z.object({ days: z.number().int().min(1).max(730).default(30).describe("Look ahead this many days (default 30).") }),
      annotations: READ,
    },
    guarded(async (s, { days }) => {
      const [list, summaries, deadlines] = await Promise.all([readList(s), getSummaries(), getDeadlines()]);
      const listed = list.flatMap((e) => {
        const c = findSummary(summaries, e.slug);
        return c ? [{ slug: e.slug, name: nameOf(c), id: c.id, plan: e.plan }] : [];
      });
      return json({ days, deadlines: upcomingDeadlines(listed, deadlines, days) });
    }),
  );

  server.registerTool(
    "get_activities",
    {
      title: "Get activities",
      description: "Common App activities and honors and UC entries, each with an id for update_activity / delete_activity, plus the list limits.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    guarded(async ({ profile }) => {
      const a = normalizeActivities(profile.activities);
      return json({
        commonAppActivities: a.commonApp.activities,
        commonAppHonors: a.commonApp.honors,
        ucEntries: a.uc,
        limits: { commonAppActivities: CA_LIMITS.activities, commonAppHonors: CA_LIMITS.honors, ucEntries: UC_LIMITS.entries },
      });
    }),
  );

  server.registerTool(
    "get_resume_settings",
    {
      title: "Get resume settings",
      description: "The resume header (name, email, phone, location, school, graduation year) and options (which activity list to use, show hours, show scores).",
      inputSchema: z.object({}),
      annotations: READ,
    },
    guarded(async ({ profile }) => json({ header: { ...EMPTY_HEADER, ...profile.resume?.header }, options: { ...DEFAULT_OPTIONS, ...profile.resume?.options } })),
  );

  server.registerTool(
    "search_colleges",
    {
      title: "Search colleges",
      description: "Search the tracker's colleges by name, short name, slug or city. Returns public summaries (admit rates, SAT range, test policy, tiers, offered application plans). Use the slug with other tools.",
      inputSchema: z.object({
        query: z.string().max(100).optional().describe("Part of a name, slug or city."),
        region: z.enum(REGIONS.map((r) => r.code) as [string, ...string[]]).optional().describe("Country code: US, GB, CA or AU."),
      }),
      annotations: READ,
    },
    guarded(async (_s, { query, region }) => {
      const q = query?.trim().toLowerCase();
      const matches = (await getSummaries()).filter(
        (c) => (!region || c.country_code === region) && (!q || [c.name, c.short_name, c.slug, c.city].some((v) => v?.toLowerCase().includes(q))),
      );
      const LIMIT = 25;
      return json({
        total: matches.length,
        shown: Math.min(LIMIT, matches.length),
        colleges: matches.slice(0, LIMIT).map((c) => ({
          slug: c.slug,
          name: c.name,
          location: [c.city, c.state_region, c.country_code].filter(Boolean).join(", "),
          admitRatePct: c.admit_rate,
          internationalAdmitRatePct: c.intl_admit_rate,
          sat25to75: c.sat_p25 != null && c.sat_p75 != null ? [c.sat_p25, c.sat_p75] : null,
          testPolicy: c.test_policy,
          generalTier: c.general_tier,
          tiers: c.tiers,
          applicationPlans: c.plans ?? [],
          nextDeadline: c.next_deadline,
        })),
        note: total(matches.length, LIMIT),
      });
    }),
  );

  server.registerTool(
    "get_college",
    {
      title: "Get college details",
      description: "The full sourced detail for one college as Markdown: admissions, test scores, deadlines, English requirements, application requirements, cost and aid, with numbered source links. Anything not published is left out; say so rather than guessing.",
      inputSchema: z.object({ slug: z.string().min(1).max(100) }),
      annotations: READ,
    },
    guarded(async (s, { slug }) => {
      const [summaries, detail, lookups, list] = await Promise.all([getSummaries(), getCollege(slug), getLookups(), readList(s)]);
      const college = findSummary(summaries, slug);
      if (!college) return notFound(slug);
      const entry = list.find((e) => e.slug === slug);
      const lines = detailSection(
        { college, plan: entry?.plan ?? null, status: entry?.status ?? "in_progress", checklist: entry?.checklist ?? {}, detail: detail ?? null },
        packLabels(lookups),
      );
      // The checklist block only means something for a listed college.
      const out = entry ? lines : dropChecklist(lines);
      return text(out.join("\n"));
    }),
  );

  server.registerTool(
    "get_context_pack",
    {
      title: "Get full context pack",
      description: "The student's whole application context as one Markdown document (the same as the website's \"Copy for AI\"): profile, activities, list with fit labels and deadlines, and every listed college's sourced details.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    guarded(async (s) => {
      const [list, summaries, deadlines, lookups] = await Promise.all([readList(s), getSummaries(), getDeadlines(), getLookups()]);
      const colleges = await Promise.all(
        list.flatMap((e) => {
          const college = findSummary(summaries, e.slug);
          return college ? [getCollege(e.slug).then((detail) => ({ college, plan: e.plan, status: e.status, checklist: e.checklist, detail }), () => ({ college, plan: e.plan, status: e.status, checklist: e.checklist, detail: null }))] : [];
        }),
      );
      return text(buildContextPack({ profile: s.profile, colleges, deadlines, ...packLabels(lookups), full: true }));
    }),
  );

  // ── Write ──

  server.registerTool(
    "update_profile",
    {
      title: "Update student profile",
      description:
        "Change GPA, SAT/ACT totals or sections, English test scores, international status or target regions. Scores are checked against each test's scale (SAT 400-1600 in steps of 10, ACT 1-36…). Set a value to null to clear it. Cannot change the plan, reminder emails or saved logins.",
      inputSchema: z.object({
        patch: z
          .object({
            gpa: score.describe("Unweighted, 0-4."),
            sat: score.describe("Total, 400-1600."),
            act: score.describe("Composite, 1-36."),
            satSections: sections.optional().describe("{ ebrw: 200-800, math: 200-800 }. Both together fill in the total."),
            actSections: sections.optional().describe("{ english, math, reading, science: 1-36; writing: 2-12 }"),
            english: z
              .record(z.string(), z.object({ total: z.number().nullable().optional(), sections: sections.optional(), date: z.string().nullable().optional() }).nullable())
              .optional()
              .describe("Keyed by test: toefl, toefl_band, ielts, duolingo, pte, cambridge. null removes a test. date is YYYY-MM-DD."),
            international: z.boolean().optional(),
            targetRegions: z.array(z.string()).optional().describe("Country codes from US, GB, CA, AU; the first is the default."),
          })
          .loose(),
      }),
      annotations: WRITE,
    },
    guarded(async (s, { patch }) => {
      return reply(
        await changeProfile(s, (profile) => {
          const r = applyProfilePatch(profile, patch);
          if (!r.ok) return { error: r.error };
          const p = r.value;
          return { columns: profileColumns(p), value: { saved: true, gpa: p.gpa ?? null, sat: p.sat ?? null, act: p.act ?? null, international: !!p.international, targetRegions: p.targetRegions ?? [], tests: p.tests ?? {} } };
        }),
      );
    }),
  );

  server.registerTool(
    "add_college",
    {
      title: "Add a college to the list",
      description: "Put a college on the student's list (status in progress). Fails if it's already listed or the plan's list limit is reached. `plan` is an application plan the college offers (ED, EA, RD…); omit it while undecided.",
      inputSchema: z.object({ slug: z.string().min(1).max(100), plan: z.string().max(20).optional() }),
      annotations: WRITE,
    },
    guarded(async (s, { slug, plan }) => {
      const [summaries, list] = await Promise.all([getSummaries(), readList(s)]);
      const college = findSummary(summaries, slug);
      if (!college) return notFound(slug);
      const c = checkAddCollege({ studentPlan: s.profile.plan, listedSlugs: list.map((e) => e.slug), slug, offeredPlans: college.plans, plan });
      if (!c.ok) return toolError(c.error);
      const { error } = await s.db.from("student_colleges").insert({ user_id: s.userId, institution_id: college.id, plan_key: c.value.plan, status: "in_progress", notes: null, checklist: {} });
      check(error, slug);
      // Like the website's "move to list": an interested college leaves the interested list once it's listed.
      const cleared = await changeProfile(s, (p) => ((p.interested ?? []).includes(slug) ? { columns: { interested: (p.interested ?? []).filter((x) => x !== slug) }, value: true } : { columns: {}, value: false }));
      if (!cleared.ok) return toolError(`${slug} was added, but it could not be removed from the interested list: ${cleared.error}`);
      const warnings = edWarnings([...list.map((e) => ({ slug: e.slug, plan: e.plan })), { slug, plan: c.value.plan }], slug);
      return json({ added: slug, name: nameOf(college), plan: c.value.plan, status: "in_progress", warnings });
    }),
  );

  server.registerTool(
    "set_interested",
    {
      title: "Mark a college interested",
      description: "Add or remove a college from the \"interested\" list (colleges being considered but not on the list). Doesn't count toward the list limit.",
      inputSchema: z.object({ slug: z.string().min(1).max(100), interested: z.boolean() }),
      annotations: WRITE,
    },
    guarded(async (s, { slug, interested }) => {
      const [summaries, list] = await Promise.all([getSummaries(), readList(s)]);
      if (!findSummary(summaries, slug)) return notFound(slug);
      return reply(
        await changeProfile(s, (p) => {
          const c = checkSetInterested({ interested: p.interested ?? [], listedSlugs: list.map((e) => e.slug), slug, value: interested });
          return c.ok ? { columns: { interested: c.value }, value: { interested: c.value } } : { error: c.error };
        }),
      );
    }),
  );

  server.registerTool(
    "update_application",
    {
      title: "Update an application",
      description:
        "Change a listed college's application plan, status or notes. plan must be one the college offers (null clears it). status: in_progress, submitted (only when every checklist item is done), or a decision (admitted, deferred, waitlisted, rejected, enrolled, withdrawn) only after submitted. Returns warnings, e.g. Early Decision at two colleges. Cannot remove a college.",
      inputSchema: z.object({
        slug: z.string().min(1).max(100),
        patch: z.object({ plan: z.string().max(20).nullable().optional(), status: z.enum(AI_STATUSES).optional(), notes: z.string().max(NOTES_MAX).optional() }),
      }),
      annotations: WRITE,
    },
    guarded(async (s, { slug, patch }) => {
      const college = findSummary(await getSummaries(), slug);
      return reply(
        await changeEntry(s, slug, (entry, list) => {
          const columns: Record<string, unknown> = {};
          let plan = entry.plan;
          if (patch.plan !== undefined) {
            const r = checkPlanKey(patch.plan, college?.plans);
            if (!r.ok) return { error: r.error };
            plan = r.value;
            columns.plan_key = plan;
          }
          let status = entry.status;
          if (patch.status !== undefined) {
            const r = checkStatusChange(entry.status, patch.status, entry.checklist);
            if (!r.ok) return { error: r.error };
            status = r.value;
            columns.status = status;
          }
          if (patch.notes !== undefined) columns.notes = patch.notes.trim() || null;
          const warnings = edWarnings(list.map((e) => ({ slug: e.slug, plan: e.slug === slug ? plan : e.plan })), slug);
          return { columns, value: { updated: slug, plan, status, notes: patch.notes !== undefined ? patch.notes.trim() || null : entry.notes || null, warnings } };
        }),
      );
    }),
  );

  server.registerTool(
    "update_checklist",
    {
      title: "Update an application checklist",
      description:
        "Tick or untick checklist items for a listed college: recommendations, transcript (sent), test_scores (sent), english_test (sent), no_essays (true = no essays needed). test_plan: sat | act | optional; english_plan: toefl | ielts | duolingo | pte | cambridge | not_required. Essays use add_essay / update_essay.",
      inputSchema: z.object({
        slug: z.string().min(1).max(100),
        patch: z
          .object({
            recommendations: z.boolean().optional(),
            transcript: z.boolean().optional(),
            test_scores: z.boolean().optional(),
            english_test: z.boolean().optional(),
            no_essays: z.boolean().optional(),
            test_plan: z.string().nullable().optional(),
            english_plan: z.string().nullable().optional(),
          })
          .loose(),
      }),
      annotations: WRITE,
    },
    guarded(async (s, { slug, patch }) => {
      return reply(
        await changeEntry(s, slug, (entry) => {
          const r = patchChecklist(entry.checklist, patch);
          if (!r.ok) return { error: r.error };
          const p = progress(r.value);
          return { columns: { checklist: r.value }, value: { updated: slug, progress: `${p.done}/${p.total}`, notDone: CHECKLIST.filter(([k]) => !isDone(k, r.value)).map(([, label]) => label) } };
        }),
      );
    }),
  );

  server.registerTool(
    "add_essay",
    {
      title: "Add an essay",
      description: "Add an essay to a listed college's checklist. url is an optional link to the draft (must start with http:// or https://). status: not_started, brainstorming, drafting, revising or final. Essays can't be deleted by AI.",
      inputSchema: z.object({
        slug: z.string().min(1).max(100),
        title: z.string().min(1).max(200),
        url: z.string().max(2000).optional(),
        status: z.enum(["not_started", "brainstorming", "drafting", "revising", "final"]).optional(),
      }),
      annotations: WRITE,
    },
    guarded(async (s, { slug, ...fields }) => {
      return reply(
        await changeEntry(s, slug, (entry) => {
          const r = addEssay(entry.checklist, fields);
          return r.ok ? { columns: { checklist: r.value.checklist }, value: { added: r.value.essay } } : { error: r.error };
        }),
      );
    }),
  );

  server.registerTool(
    "update_essay",
    {
      title: "Update an essay",
      description: "Change an essay's title, link or status. An empty title makes the essay untitled. essay_id comes from get_applications. Essays can't be deleted by AI.",
      inputSchema: z.object({
        slug: z.string().min(1).max(100),
        essay_id: z.string().min(1).max(100),
        patch: z.object({ title: z.string().max(200).optional(), url: z.string().max(2000).optional(), status: z.enum(["not_started", "brainstorming", "drafting", "revising", "final"]).optional() }),
      }),
      annotations: WRITE,
    },
    guarded(async (s, { slug, essay_id, patch }) => {
      return reply(
        await changeEntry(s, slug, (entry) => {
          const r = updateEssay(entry.checklist, essay_id, patch);
          return r.ok ? { columns: { checklist: r.value.checklist }, value: { updated: r.value.essay } } : { error: r.error };
        }),
      );
    }),
  );

  const kind = z.enum(ACTIVITY_KINDS).describe("common_app_activity (max 10), common_app_honor (max 5) or uc_entry (max 20).");
  const activityFields = z
    .object({
      type: z.string().optional().describe("Common App activity type, e.g. Robotics, Research, Work (Paid)."),
      position: z.string().optional().describe("Common App activity: max 50 characters."),
      organization: z.string().optional().describe("Common App activity: max 100 characters. UC: max 60."),
      description: z.string().optional().describe("Common App activity: max 150 characters. UC entry: max 350."),
      title: z.string().optional().describe("Common App honor: max 100 characters."),
      name: z.string().optional().describe("UC entry: max 60 characters."),
      category: z.string().optional().describe("UC entry, on add only: award, edprep, extracurricular, coursework, volunteer or work."),
      extra: z.string().optional().describe("UC entry: max 250 characters."),
      grades: z.array(z.string()).optional().describe('Any of "9", "10", "11", "12", "PG".'),
      timing: z.array(z.string()).optional().describe('Common App activity: "school" and/or "break".'),
      levels: z.array(z.string()).optional().describe("Common App honor: school, state_regional, national, international."),
      hoursPerWeek: z.number().nullable().optional(),
      weeksPerYear: z.number().nullable().optional(),
      continueInCollege: z.boolean().nullable().optional(),
      awardLevel: z.string().nullable().optional().describe("UC award: school, city, state, regional, national, international."),
      awardType: z.string().nullable().optional().describe("UC award: academic or non_academic."),
    })
    .loose();

  server.registerTool(
    "add_activity",
    {
      title: "Add an activity or honor",
      description: "Add a Common App activity, Common App honor or UC entry. Limits and character counts follow the application forms; a too-long field is rejected, not cut.",
      inputSchema: z.object({ kind, fields: activityFields }),
      annotations: WRITE,
    },
    guarded(async (s, { kind, fields }) => {
      return reply(
        await changeProfile(s, (p) => {
          const r = addActivity(p.activities, kind, fields);
          return r.ok ? { columns: { activities: r.value.data }, value: { added: r.value.item } } : { error: r.error };
        }),
      );
    }),
  );

  server.registerTool(
    "update_activity",
    {
      title: "Update an activity or honor",
      description: "Change fields of an existing activity, honor or UC entry. Only the fields in `patch` change. ids come from get_activities.",
      inputSchema: z.object({ kind, id: z.string().min(1).max(100), patch: activityFields }),
      annotations: WRITE,
    },
    guarded(async (s, { kind, id, patch }) => {
      return reply(
        await changeProfile(s, (p) => {
          const r = updateActivity(p.activities, kind, id, patch);
          return r.ok ? { columns: { activities: r.value.data }, value: { updated: r.value.item } } : { error: r.error };
        }),
      );
    }),
  );

  server.registerTool(
    "delete_activity",
    {
      title: "Delete an activity or honor",
      description: "Permanently delete an activity, honor or UC entry. Confirm with the student first.",
      inputSchema: z.object({ kind, id: z.string().min(1).max(100) }),
      annotations: DESTROY,
    },
    guarded(async (s, { kind, id }) => {
      return reply(
        await changeProfile(s, (p) => {
          const r = deleteActivity(p.activities, kind, id);
          return r.ok ? { columns: { activities: r.value.data }, value: { deleted: r.value.removed } } : { error: r.error };
        }),
      );
    }),
  );

  server.registerTool(
    "update_resume_settings",
    {
      title: "Update resume settings",
      description: "Change the resume header (fullName, email, phone, location, school, gradYear) and options (source: common | uc | both; showHours; showScores).",
      inputSchema: z.object({
        patch: z.object({
          header: z.object({ fullName: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), location: z.string().optional(), school: z.string().optional(), gradYear: z.string().optional() }).loose().optional(),
          options: z.object({ source: z.enum(["common", "uc", "both"]).optional(), showHours: z.boolean().optional(), showScores: z.boolean().optional() }).loose().optional(),
        }),
      }),
      annotations: WRITE,
    },
    guarded(async (s, { patch }) => {
      return reply(
        await changeProfile(s, (p) => {
          const r = applyResumePatch(p.resume, patch);
          return r.ok ? { columns: { resume: r.value }, value: { header: { ...EMPTY_HEADER, ...r.value.header }, options: { ...DEFAULT_OPTIONS, ...r.value.options } } } : { error: r.error };
        }),
      );
    }),
  );
}

const total = (n: number, limit: number) => (n > limit ? `Showing the first ${limit} of ${n}. Narrow the search to see others.` : undefined);

const packLabels = (lookups: Lookups) => ({
  planLabels: Object.fromEntries(lookups.plans.map((p) => [p.key, p.label])),
  englishTestNames: Object.fromEntries(lookups.englishTests.map((t) => [t.key, t.name])),
});

/** detailSection ends with the student's own checklist; for a college that isn't listed that block would read as "nothing done". */
function dropChecklist(lines: string[]) {
  const i = lines.findIndex((l) => l === "- My checklist:");
  if (i < 0) return lines;
  let j = i + 1;
  while (j < lines.length && lines[j].startsWith("  - ")) j++;
  return [...lines.slice(0, i), ...lines.slice(j)];
}
