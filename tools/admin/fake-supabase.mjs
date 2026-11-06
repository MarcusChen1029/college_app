// A small in-memory stand-in for the Supabase REST and Auth admin APIs, for server.test.mjs and for trying the page
// without a real key: `node tools/admin/fake-supabase.mjs` opens the tool on port 4179 with made-up data.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const FAKE_KEY = "fake-service-key";
const DEMO_PORT = 4179;
const PAGE_CAP = 1000; // PostgREST's max-rows: a longer read is cut with no error

const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();

export function sampleData() {
  return {
    users: [
      { id: "u-student", email: "student@example.test", created_at: "2026-09-01T02:00:00Z", last_sign_in_at: "2026-11-01T02:00:00Z" },
      { id: "u-teacher", email: "teacher@example.test", created_at: "2026-10-01T02:00:00Z", last_sign_in_at: "2026-10-20T02:00:00Z" },
      { id: "u-new", email: "new@example.test", created_at: "2026-11-02T02:00:00Z", last_sign_in_at: null },
    ],
    tables: {
      user_roles: [
        { user_id: "u-student", role: "student" },
        { user_id: "u-teacher", role: "teacher" },
      ],
      student_profiles: [
        {
          user_id: "u-student",
          display_name: "<b>Sam</b> Student",
          plan_windows: [{ entry_year: 2027, from: "2026-01-01", until: "2027-07-31" }],
          portals: { commonapp: { username: "PORTAL-USERNAME-MUST-NOT-LEAK" } },
          sat_total: 1400,
        },
      ],
      teacher_profiles: [{ user_id: "u-teacher", display_name: "Tess Teacher", school: "North High" }],
      student_colleges: [
        { id: "c1", user_id: "u-student", portal_username: "PORTAL-USERNAME-MUST-NOT-LEAK", notes: "private" },
        { id: "c2", user_id: "u-student", portal_username: null, notes: null },
      ],
      plan_orders: [{ id: "o1", user_id: "u-student", entry_year: 2027, status: "paid" }],
      coupons: [
        { code: "classa2027spring", kind: "free_pass", active: true, max_redemptions: 3, expires_at: daysFromNow(30), note: "Class A", created_at: "2026-11-02T00:00:00Z" },
        { code: "freetest", kind: "free_pass", active: false, max_redemptions: null, expires_at: null, note: null, created_at: "2026-11-01T00:00:00Z" },
      ],
      coupon_redemptions: [
        { id: "r1", coupon_code: "classa2027spring", user_id: "u-student", order_id: "o1", redeemed_at: "2026-11-03T00:00:00Z" },
        { id: "r2", coupon_code: "classa2027spring", user_id: null, order_id: null, redeemed_at: "2026-11-04T00:00:00Z" },
      ],
    },
  };
}

const readBody = async (req) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : null;
};

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const matches = (row, params) =>
  [...params].every(([column, value]) =>
    ["select", "order", "limit", "offset"].includes(column) || !value.startsWith("eq.") || String(row[column]) === value.slice(3));

function pick(row, select) {
  if (!select || select === "*") return row;
  return Object.fromEntries(select.split(",").map((column) => [column, row[column]]));
}

/** Starts on 127.0.0.1. `data` is live: tests can change it. */
export async function startFakeSupabase({ port = 0, data = sampleData() } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://fake");
    if (req.headers.apikey !== FAKE_KEY || req.headers.authorization !== `Bearer ${FAKE_KEY}`) {
      return send(res, 401, { message: "Invalid API key" });
    }
    if (url.pathname === "/auth/v1/admin/users") {
      const perPage = Number(url.searchParams.get("per_page") ?? 50);
      const start = (Number(url.searchParams.get("page") ?? 1) - 1) * perPage;
      return send(res, 200, { users: data.users.slice(start, start + perPage) });
    }
    const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    if (!table || !data.tables[table]) return send(res, 404, { message: "not found" });
    const rows = data.tables[table];

    if (req.method === "GET") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? PAGE_CAP), PAGE_CAP);
      const found = rows.filter((row) => matches(row, url.searchParams)).slice(offset, offset + limit);
      return send(res, 200, found.map((row) => pick(row, url.searchParams.get("select"))));
    }
    if (req.method === "POST") {
      const row = await readBody(req);
      if (rows.some((other) => other.code === row.code)) {
        return send(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
      }
      const stored = { kind: "free_pass", active: true, created_at: new Date().toISOString(), ...row };
      rows.push(stored);
      return send(res, 201, [stored]);
    }
    if (req.method === "PATCH") {
      const patch = await readBody(req);
      const found = rows.filter((row) => matches(row, url.searchParams));
      found.forEach((row) => Object.assign(row, patch));
      return send(res, 200, found);
    }
    return send(res, 405, { message: "method not allowed" });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, data, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { startAdminServer } = await import("./server.mjs");
  const { url } = await startFakeSupabase();
  const { port } = await startAdminServer({ supabaseUrl: url, serviceKey: FAKE_KEY, port: DEMO_PORT });
  console.log(`Owner tools with made-up data: http://127.0.0.1:${port}`);
}
