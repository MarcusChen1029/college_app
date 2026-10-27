import { getCollege } from "@/lib/data";
import { collegeSupplements } from "@/lib/supplements-data";

// Full college records for the "Copy for AI" pack: GET /api/college-details?slugs=brown,rice.
// Reference data is public, so this needs no auth; it only batches the cached getCollege reads.
const MAX = 100;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("slugs") ?? "";
  const slugs = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9-]{1,80}$/.test(s)))];
  if (!slugs.length || slugs.length > MAX) return Response.json({ error: `Pass 1–${MAX} college slugs.` }, { status: 400 });
  const results = await Promise.allSettled(slugs.map((s) => getCollege(s)));
  // Supplemental prompts are static data (lib/data/supplements.json), attached here so the pack can include them.
  const colleges = Object.fromEntries(
    slugs.map((s, i) => {
      const r = results[i];
      return [s, r.status === "fulfilled" && r.value ? { ...r.value, supplements: collegeSupplements(s) } : null];
    }),
  );
  return Response.json({ colleges });
}
