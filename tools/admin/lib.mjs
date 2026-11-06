// Pure rules for the owner's local admin tool (see README.md): no network, no files.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/i/l: codes get read aloud and retyped
const CODE_LENGTH = 16;
const MIN_CODE_LENGTH = 12;
const MAX_CODE_LENGTH = 32;
const MAX_USES = 10000;
const MAX_NOTE = 200;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Same clean-up as public.redeem_coupon, so a code is stored the way it will be looked up. */
export const normalizeCode = (value) => String(value ?? "").replace(/[\s-]/g, "").toLowerCase();

export function generateCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** A date picked on the page means the end of that day in Taipei. */
export const expiryFromDate = (day) => `${day}T23:59:59+08:00`;

/** The "YYYY-MM-DD" of a stored time on the Taipei calendar. */
export function taipeiDate(iso) {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

export const taipeiToday = (now = new Date()) => taipeiDate(now.toISOString());

function usesError(value) {
  const fine = Number.isInteger(value) && value >= 1 && value <= MAX_USES;
  return fine ? null : `Set a usage limit from 1 to ${MAX_USES}.`;
}

function expiryError(day, today) {
  const real = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
  if (!real) return "Pick an expiry date.";
  return day < today ? "That expiry date is in the past." : null;
}

function cleanNote(value) {
  const note = String(value ?? "").trim();
  if (note.length > MAX_NOTE) return { error: `Keep the note to at most ${MAX_NOTE} characters.` };
  return { note: note || null };
}

function typedCodeError(code) {
  if (!/^[a-z0-9]*$/.test(code)) return "A code can only use letters and numbers.";
  if (code.length < MIN_CODE_LENGTH) return `A typed code needs at least ${MIN_CODE_LENGTH} characters, so it can't be guessed.`;
  if (code.length > MAX_CODE_LENGTH) return `A code can have at most ${MAX_CODE_LENGTH} characters.`;
  return null;
}

/** The page's "new code" form -> a coupons row. A code always gets a usage limit and an expiry date. */
export function parseNewCode(body, today) {
  const typed = normalizeCode(body.code);
  const { note, error: noteError } = cleanNote(body.note);
  const error = (typed && typedCodeError(typed)) || usesError(body.maxUses) || expiryError(body.expiresOn, today) || noteError;
  if (error) return { ok: false, error };
  return {
    ok: true,
    row: { code: typed || generateCode(), max_redemptions: body.maxUses, expires_at: expiryFromDate(body.expiresOn), note },
  };
}

/** The page's edit -> the coupons columns to change. The code and kind can't be changed. */
export function parseEdit(body, today) {
  const patch = {};
  if ("active" in body) {
    if (typeof body.active !== "boolean") return { ok: false, error: "Choose on or off." };
    patch.active = body.active;
  }
  if ("maxUses" in body) {
    const error = usesError(body.maxUses);
    if (error) return { ok: false, error };
    patch.max_redemptions = body.maxUses;
  }
  if ("expiresOn" in body) {
    const error = expiryError(body.expiresOn, today);
    if (error) return { ok: false, error };
    patch.expires_at = expiryFromDate(body.expiresOn);
  }
  if ("note" in body) {
    const { note, error } = cleanNote(body.note);
    if (error) return { ok: false, error };
    patch.note = note;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change." };
  return { ok: true, patch };
}

/** Why this change must not go through, or null. A code left on must be long, limited and not expired. */
export function checkEdit(row, patch, used, now) {
  if (patch.max_redemptions != null && patch.max_redemptions < used) {
    return `This code has already been used ${used} times, so the limit can't be lower than that. Switch it off to stop it.`;
  }
  const merged = { ...row, ...patch };
  const touchesAccess = "active" in patch || "max_redemptions" in patch || "expires_at" in patch;
  if (!merged.active || !touchesAccess) return null;
  if (merged.code.length < MIN_CODE_LENGTH) return "This code is too short to be safe. Make a new code instead.";
  if (merged.max_redemptions == null) return "Set a usage limit before switching this code on.";
  if (!merged.expires_at || new Date(merged.expires_at) <= now) return "Set a future expiry date before switching this code on.";
  return null;
}

/** Whether a student can use the code right now, and if not, why. Mirrors the checks in public.redeem_coupon. */
export function codeStatus(row, used, now) {
  if (!row.active) return "off";
  if (row.expires_at && new Date(row.expires_at) <= now) return "expired";
  if (row.max_redemptions != null && used >= row.max_redemptions) return "used up";
  return "on";
}

/** student_profiles.plan_windows in words (activeWindow / upcomingWindow in web/lib/plans.ts). */
export function passLabel(windows, today) {
  const list = windows ?? [];
  const active = list.filter((w) => w.from <= today && today <= w.until).sort((a, b) => b.until.localeCompare(a.until))[0];
  if (active) return `Pass until ${active.until}`;
  const next = list.filter((w) => w.from > today).sort((a, b) => a.from.localeCompare(b.from))[0];
  return next ? `Pass starts ${next.from}` : "Free";
}

/** One row per account, newest first. Only these fields ever reach the page. */
export function summarizeAccounts({ users, roles, profiles, teachers, colleges, today }) {
  const byUser = (rows) => new Map(rows.map((row) => [row.user_id, row]));
  const roleOf = byUser(roles);
  const profileOf = byUser(profiles);
  const teacherOf = byUser(teachers);
  const listSize = new Map();
  for (const { user_id: id } of colleges) listSize.set(id, (listSize.get(id) ?? 0) + 1);

  return [...users]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((user) => {
      const role = roleOf.get(user.id)?.role ?? null;
      const teacher = role === "teacher" ? teacherOf.get(user.id) : undefined;
      const profile = profileOf.get(user.id);
      return {
        id: user.id,
        email: user.email ?? null,
        name: (teacher ?? profile)?.display_name ?? null,
        school: teacher?.school ?? null,
        role,
        plan: passLabel(profile?.plan_windows, today),
        colleges: listSize.get(user.id) ?? 0,
        joined: taipeiDate(user.created_at),
        lastSignIn: taipeiDate(user.last_sign_in_at),
      };
    });
}

const sameSecret = (a, b) => {
  const hash = (value) => createHash("sha256").update(String(value)).digest();
  return timingSafeEqual(hash(a), hash(b));
};

/**
 * Null when the request may go on. The server holds a key that can read every account, and any website the owner
 * has open can send requests to 127.0.0.1, so: the Host must be ours (stops DNS rebinding), and API calls need the
 * token only our own page can read, must not come from another origin, and writes must be JSON.
 */
export function guardRequest({ method, path, headers }, { port, token }) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(headers.host)) return { status: 403, error: "Wrong host." };
  if (!path.startsWith("/api/")) return null;

  const fetchSite = headers["sec-fetch-site"];
  const sameSite = !fetchSite || fetchSite === "same-origin";
  const sameOrigin = !headers.origin || hosts.some((host) => headers.origin === `http://${host}`);
  if (!sameSite || !sameOrigin) return { status: 403, error: "Refused: this came from another site." };
  if (!headers["x-admin-token"] || !sameSecret(headers["x-admin-token"], token)) {
    return { status: 403, error: "Reload the page: this session has ended." };
  }
  const isWrite = method !== "GET" && method !== "HEAD";
  if (isWrite && !String(headers["content-type"] ?? "").startsWith("application/json")) {
    return { status: 415, error: "Expected JSON." };
  }
  return null;
}

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}
