// Campus photographs on the share pages, in the home page's one treatment (.duo: navy duotone; .stamp: a postage
// stamp). Only colleges with a photo in lib/campus-photos.ts get one; nothing is faked. Every photo shown is credited.

import Image from "next/image";
import { CAMPUS, type CampusPhoto } from "@/lib/campus-photos";

// parent_view sends college names, not slugs. Names are compared without case, commas or dash style
// ("University of Michigan–Ann Arbor" and "University of Michigan-Ann Arbor" are the same college).
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/[,.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const NAMES: [string, CampusPhoto][] = [
  ["University of California, Berkeley", CAMPUS.berkeley],
  ["University of California-Berkeley", CAMPUS.berkeley],
  ["Massachusetts Institute of Technology", CAMPUS.mit],
  ["University of Michigan–Ann Arbor", CAMPUS.michigan],
  ["Purdue University–West Lafayette", CAMPUS.purdue],
  ["Purdue University-Main Campus", CAMPUS.purdue],
  ["University of Illinois Urbana-Champaign", CAMPUS.uiuc],
  ["University of Arkansas", CAMPUS.arkansas],
  ["Stanford University", CAMPUS.stanford],
  ["Columbia University in the City of New York", CAMPUS.columbia],
  ["Princeton University", CAMPUS.princeton],
];
const BY_NAME = new Map(NAMES.map(([n, p]) => [norm(n), p]));

/** The registry photo for a college name, or null when there is none. */
export const campusFor = (name: string): CampusPhoto | null => BY_NAME.get(norm(name)) ?? null;

/** A campus photograph in the duotone. The caller sizes the box; `stamp` frames it as a perforated postage stamp. */
export function Duo({ photo, className = "", sizes, stamp = false, decorative = false, priority = false }: { photo: CampusPhoto; className?: string; sizes: string; stamp?: boolean; decorative?: boolean; priority?: boolean }) {
  const img = <Image src={photo.src} alt={decorative ? "" : photo.title} fill priority={priority} sizes={sizes} className="object-cover" />;
  if (stamp) {
    return (
      <div className={`stamp ${className}`}>
        <div className="duo aspect-[4/5]">{img}</div>
      </div>
    );
  }
  return <div className={`duo ${className}`}>{img}</div>;
}

/** The visible credit line: each photo's subject (linked to its source page), creator and licence. */
export function PhotoCredits({ photos, label, className = "" }: { photos: CampusPhoto[]; label: string; className?: string }) {
  const unique = photos.filter((p, i) => photos.findIndex((q) => q.src === p.src) === i);
  if (unique.length === 0) return null;
  return (
    <p className={`text-base leading-relaxed text-zinc-700 ${className}`}>
      {label}:{" "}
      {unique.map((p, i) => (
        <span key={p.src}>
          <a href={p.sourcePage} className="underline underline-offset-2 hover:text-blue-700">
            {p.title}
          </a>{" "}
          ({p.creator},{" "}
          <a href={p.licenceUrl} className="underline underline-offset-2 hover:text-blue-700">
            {p.licence}
          </a>
          ){i < unique.length - 1 ? "; " : "."}
        </span>
      ))}
    </p>
  );
}
