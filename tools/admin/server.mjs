// The owner's local admin tool: `node tools/admin/server.mjs`, then open http://127.0.0.1:4177. See README.md.
// It holds the Supabase service role key, so it only ever listens on this computer and is never deployed.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkEdit, codeStatus, guardRequest, parseEdit, parseEnv, parseNewCode, summarizeAccounts, taipeiDate, taipeiToday } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_URL = "https://eyvmtaggayqizllaseiu.supabase.co";
const DEFAULT_PORT = 4177;
const MAX_BODY = 16 * 1024;
const PAGE_SIZE = 1000; // the API's cap: a longer read is cut with no error, so reads go page by page
const USERS_PAGE = 200;
const TIMEOUT_MS = 15000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function supabaseClient(supabaseUrl, serviceKey) {
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };

  async function call(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch(`${supabaseUrl}${path}`, {
        method,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { ...headers, ...(body ? { "content-type": "application/json", prefer: "return=representation" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new HttpError(502, "Couldn't reach Supabase. Check your internet connection.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(502, "Supabase refused the key. Check SUPABASE_SERVICE_ROLE_KEY in tools/admin/.env.");
    }
    if (res.status === 409) throw new HttpError(409, "That code already exists.");
    if (!res.ok) throw new HttpError(502, `Supabase answered with an error (${res.status}).`);
    return res.json();
  }

  /** Every row, reading page by page on a unique order. `columns` is always a named list, never "*". */
  async function allRows(table, columns, uniqueKey, filter = "") {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await call(`/rest/v1/${table}?select=${columns}&order=${uniqueKey}.asc&limit=${PAGE_SIZE}&offset=${offset}${filter}`);
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  }

  async function allUsers() {
    const users = [];
    for (let page = 1; ; page++) {
      const result = await call(`/auth/v1/admin/users?page=${page}&per_page=${USERS_PAGE}`);
      users.push(...result.users);
      if (result.users.length < USERS_PAGE) return users;
    }
  }

  return { call, allRows, allUsers };
}

const COUPON_COLUMNS = "code,active,max_redemptions,expires_at,note,created_at";

async function loadCodes(db, now) {
  const [coupons, redemptions, orders, users] = await Promise.all([
    db.allRows("coupons", COUPON_COLUMNS, "code"),
    db.allRows("coupon_redemptions", "id,coupon_code,user_id,order_id,redeemed_at", "id"),
    db.allRows("plan_orders", "id,entry_year,status", "id"),
    db.allUsers(),
  ]);
  const emailOf = new Map(users.map((user) => [user.id, user.email]));
  const orderOf = new Map(orders.map((order) => [order.id, order]));
  const usesOf = new Map();
  for (const use of [...redemptions].sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at))) {
    const order = orderOf.get(use.order_id);
    if (!usesOf.has(use.coupon_code)) usesOf.set(use.coupon_code, []);
    usesOf.get(use.coupon_code).push({
      email: emailOf.get(use.user_id) ?? null,
      on: taipeiDate(use.redeemed_at),
      entryYear: order?.entry_year ?? null,
      orderStatus: order?.status ?? null,
    });
  }
  return [...coupons]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => {
      const uses = usesOf.get(row.code) ?? [];
      return {
        code: row.code,
        note: row.note,
        status: codeStatus(row, uses.length, now),
        active: row.active,
        used: uses.length,
        limit: row.max_redemptions,
        expiresOn: taipeiDate(row.expires_at),
        createdOn: taipeiDate(row.created_at),
        redemptions: uses,
      };
    });
}

async function loadAccounts(db, now) {
  const [users, roles, profiles, teachers, colleges] = await Promise.all([
    db.allUsers(),
    db.allRows("user_roles", "user_id,role", "user_id"),
    db.allRows("student_profiles", "user_id,display_name,plan_windows", "user_id"),
    db.allRows("teacher_profiles", "user_id,display_name,school", "user_id"),
    db.allRows("student_colleges", "id,user_id", "id"),
  ]);
  return summarizeAccounts({ users, roles, profiles, teachers, colleges, today: taipeiToday(now) });
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > MAX_BODY) throw new HttpError(413, "That's too much text.");
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Expected JSON.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Expected JSON.");
  return body;
}

const findCode = async (db, code, now) => (await loadCodes(db, now)).find((item) => item.code === code);

async function createCode(db, body, now) {
  const parsed = parseNewCode(body, taipeiToday(now));
  if (!parsed.ok) throw new HttpError(400, parsed.error);
  await db.call("/rest/v1/coupons", { method: "POST", body: parsed.row });
  return findCode(db, parsed.row.code, now);
}

async function editCode(db, code, body, now) {
  const parsed = parseEdit(body, taipeiToday(now));
  if (!parsed.ok) throw new HttpError(400, parsed.error);
  const [row] = await db.call(`/rest/v1/coupons?select=${COUPON_COLUMNS}&code=eq.${code}`);
  if (!row) throw new HttpError(404, "That code doesn't exist.");
  const uses = await db.allRows("coupon_redemptions", "id", "id", `&coupon_code=eq.${code}`);
  const refusal = checkEdit(row, parsed.patch, uses.length, now);
  if (refusal) throw new HttpError(400, refusal);
  await db.call(`/rest/v1/coupons?code=eq.${code}`, { method: "PATCH", body: parsed.patch });
  return findCode(db, code, now);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

function sendPage(res, template, token) {
  const nonce = randomBytes(16).toString("base64");
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
  res.end(template.replaceAll("__NONCE__", nonce).replaceAll("__TOKEN__", token));
}

async function route(req, res, path, db, page, token) {
  const now = new Date();
  const { method } = req;
  if (method === "GET" && path === "/") return sendPage(res, page, token);
  if (method === "GET" && path === "/api/codes") return sendJson(res, 200, { codes: await loadCodes(db, now) });
  if (method === "GET" && path === "/api/accounts") return sendJson(res, 200, { accounts: await loadAccounts(db, now) });
  if (method === "POST" && path === "/api/codes") return sendJson(res, 201, { code: await createCode(db, await readJson(req), now) });
  // The pattern is the coupons table's own check, so nothing else can reach the database filter.
  const code = path.match(/^\/api\/codes\/([a-z0-9]{3,32})$/)?.[1];
  if (method === "PATCH" && code) return sendJson(res, 200, { code: await editCode(db, code, await readJson(req), now) });
  return sendJson(res, 404, { error: "Not found." });
}

/** Listens on 127.0.0.1 only. `port: 0` picks a free port. */
export async function startAdminServer({ supabaseUrl, serviceKey, port }) {
  const db = supabaseClient(supabaseUrl, serviceKey);
  const page = readFileSync(join(HERE, "page.html"), "utf8");
  const token = randomBytes(32).toString("hex"); // new each run; only our own page can read it

  const server = createServer(async (req, res) => {
    const path = req.url.split("?")[0];
    const refusal = guardRequest({ method: req.method, path, headers: req.headers }, { port: server.address().port, token });
    if (refusal) return sendJson(res, refusal.status, { error: refusal.error });
    try {
      await route(req, res, path, db, page, token);
    } catch (error) {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
      console.error(error);
      sendJson(res, 500, { error: "Something went wrong. See the terminal." });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, port: server.address().port, token };
}

function loadEnvFile() {
  try {
    return parseEnv(readFileSync(join(HERE, ".env"), "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const fileEnv = loadEnvFile();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.ADMIN_SUPABASE_URL || PROJECT_URL;
  const port = Number(process.env.ADMIN_PORT) || DEFAULT_PORT;

  if (!serviceKey || serviceKey.startsWith("sb_publishable_")) {
    console.error(`No service role key found.

1. Open Supabase > Project Settings > API Keys and copy the secret (service_role) key.
2. Put it in ${join(HERE, ".env")} as one line:
   SUPABASE_SERVICE_ROLE_KEY=<the key>
3. Run this command again.

That file is ignored by git. Don't paste the key into a chat or a commit.`);
    process.exit(1);
  }

  try {
    const { port: actual } = await startAdminServer({ supabaseUrl, serviceKey, port });
    console.log(`Owner tools: http://127.0.0.1:${actual}\nOnly this computer can open it. Press Ctrl+C to stop.`);
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    console.error(`Port ${port} is already in use: the tool may already be running at http://127.0.0.1:${port}`);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
