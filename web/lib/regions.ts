// Countries the app can show colleges for. Codes match public.countries.code / institutions.country_code
// (the United Kingdom is "GB"). Add a region here and give it a map in components/RegionMap.
export type RegionCode = "US" | "GB";

export const REGIONS: { code: RegionCode; label: string; short: string }[] = [
  { code: "US", label: "United States", short: "US" },
  { code: "GB", label: "United Kingdom", short: "UK" },
];

export const DEFAULT_REGION: RegionCode = "US";

export const isRegion = (v: unknown): v is RegionCode => REGIONS.some((r) => r.code === v);

export const regionLabel = (code: string) => REGIONS.find((r) => r.code === code)?.label ?? code;

// Keeps only known codes, without repeats, in the order given.
export const cleanRegions = (v: unknown): RegionCode[] => (Array.isArray(v) ? [...new Set(v.filter(isRegion))] : []);

// The region the colleges page opens on: the student's first target region, else the US.
export const defaultRegion = (targets?: string[]): RegionCode => cleanRegions(targets)[0] ?? DEFAULT_REGION;
