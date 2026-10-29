// A numbered link from a fact to the college page's Sources list ("[3]"). Set at 13px so it can be read, a little raised,
// never as a 10px superscript. `light` is for the navy answer band. No hooks: usable from server and client components.
export function Ref({ n, light = false }: { n: number | undefined; light?: boolean }) {
  if (!n) return null;
  return (
    <a
      href={`#src-${n}`}
      className={`ml-1 inline-block align-[0.2em] text-[13px] leading-none font-semibold tabular-nums hover:underline ${light ? "text-blue-200" : "text-blue-700"}`}
    >
      [{n}]
    </a>
  );
}
