"use client";

// Typed wrappers for the share-link RPCs (migration 0032). The raw token exists only in the return value of
// createShareLink; the page shows it once and never stores it. Viewing calls go out with the publishable key
// (anon, or the visitor's own session if they happen to be signed in); no service role is involved.

import { isExpired, normalizeParentView, normalizePortfolioView, type ParentView, type PortfolioView, type ShareKind } from "./share-links.ts";
import { browserSupabase } from "./supabase-browser.ts";

const db = () => browserSupabase();

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export type ShareLink = {
  id: string;
  kind: ShareKind;
  label: string;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  expiresAt: string | null;
  /** Past expiresAt when the list was loaded; an expired link no longer opens. */
  expired: boolean;
};

type ShareLinkRow = {
  id: string;
  kind: ShareKind;
  label: string;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  expires_at?: string | null;
};
const LINK_COLUMNS = "id, kind, label, created_at, revoked_at, last_viewed_at";

/** The signed-in student's links of one kind, newest first (revoked ones included). */
export async function listShareLinks(kind: ShareKind): Promise<ShareLink[]> {
  const query = (columns: string) => db().from("share_links").select(columns).eq("kind", kind).order("created_at", { ascending: false });
  let res = await query(`${LINK_COLUMNS}, expires_at`);
  // expires_at comes with migration 0041; until that is applied (42703 = no such column), list the links without it.
  if (res.error?.code === "42703") res = await query(LINK_COLUMNS);
  const rows = check(res) as unknown as ShareLinkRow[];
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
    lastViewedAt: r.last_viewed_at,
    expiresAt: r.expires_at ?? null,
    expired: isExpired(r.expires_at, now),
  }));
}

/** Makes a new link (replacing the active one of that kind) and returns its token: the only time it exists in clear. */
export async function createShareLink(kind: ShareKind, label?: string): Promise<string> {
  return check(await db().rpc("create_share_link", label ? { p_kind: kind, p_label: label } : { p_kind: kind })) as string;
}

export async function revokeShareLink(id: string): Promise<void> {
  check(await db().rpc("revoke_share_link", { p_id: id }));
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Null when the link is unknown, revoked or anything goes wrong (the page then says the link is not active). */
export async function fetchParentView(token: string): Promise<ParentView | null> {
  try {
    const res = await db().rpc("parent_view", { p_token: token, p_today: localToday() });
    return res.error ? null : normalizeParentView(res.data);
  } catch {
    return null;
  }
}

export async function fetchPortfolioView(token: string): Promise<PortfolioView | null> {
  try {
    const res = await db().rpc("portfolio_view", { p_token: token });
    return res.error ? null : normalizePortfolioView(res.data);
  } catch {
    return null;
  }
}

export { localToday };
