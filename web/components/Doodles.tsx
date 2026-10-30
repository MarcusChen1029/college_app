// Hand-drawn style line art used on the homepage. Navy outlines, flat accent fills.
// All decorative: aria-hidden, no interaction.

const INK = "#12304a";

type P = { className?: string; style?: React.CSSProperties };

export function Scribble({ className }: P) {
  // A loose hand-drawn oval, drawn around a word in the headline.
  return (
    <svg aria-hidden viewBox="0 0 400 120" preserveAspectRatio="none" className={className} fill="none">
      <path
        d="M30 64c8-30 90-48 190-46 98 2 160 20 160 46 0 28-86 46-186 44C100 106 12 92 40 56c10-13 40-22 70-28"
        stroke="#1fa4e4"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GradCap({ className, style }: P) {
  return (
    <svg aria-hidden viewBox="0 0 160 130" className={className} style={style} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M80 14 8 48l72 34 72-34-72-34Z" fill="#cdeafc" />
      <path d="M36 62v32c0 10 20 22 44 22s44-12 44-22V62" fill="#ffffff" />
      <path d="M144 52v44" />
      <circle cx="144" cy="102" r="7" fill="#ffd84d" />
    </svg>
  );
}

export function Pencil({ className, style }: P) {
  return (
    <svg aria-hidden viewBox="0 0 160 60" className={className} style={style} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 30 34 12h104a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H34L10 30Z" fill="#ffd84d" />
      <path d="M10 30 34 12v36L10 30Z" fill="#ffffff" />
      <path d="M10 30l8-6v12l-8-6Z" fill={INK} />
      <path d="M112 12v36" />
    </svg>
  );
}

export function Calendar({ className, style }: P) {
  return (
    <svg aria-hidden viewBox="0 0 120 130" className={className} style={style} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="20" width="104" height="100" rx="14" fill="#ffffff" />
      <path d="M8 50h104" />
      <path d="M8 34a14 14 0 0 1 14-14h76a14 14 0 0 1 14 14v16H8V34Z" fill="#ff7a66" />
      <path d="M36 8v22M84 8v22" />
      <path d="M32 78h10M55 78h10M78 78h10M32 98h10M55 98h10" />
      <circle cx="83" cy="98" r="9" fill="#6fd9b3" />
    </svg>
  );
}

export function Star({ className, style }: P) {
  return (
    <svg aria-hidden viewBox="0 0 80 80" className={className} style={style} fill="none" stroke={INK} strokeWidth="4" strokeLinejoin="round">
      <path d="m40 6 10 22 24 3-18 16 5 24-21-12-21 12 5-24L6 31l24-3 10-22Z" fill="#ffd84d" />
    </svg>
  );
}

export function PaperPlane({ className, style }: P) {
  return (
    <svg aria-hidden viewBox="0 0 140 110" className={className} style={style} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 46 132 10 98 100 66 70 8 46Z" fill="#ffffff" />
      <path d="m66 70 66-60M66 70l-4 28 22-22" fill="#b7e3fb" />
      <path d="M4 96c14 2 22-4 28-12" stroke="#1fa4e4" />
    </svg>
  );
}

export function Squiggle({ className }: P) {
  return (
    <svg aria-hidden viewBox="0 0 200 24" className={className} fill="none" stroke="#1fa4e4" strokeWidth="4" strokeLinecap="round">
      <path d="M4 12c14-14 20 14 34 0s20 14 34 0 20 14 34 0 20 14 34 0 20 14 34 0" />
    </svg>
  );
}

export function Wave({ className, fill = "#e9f2fa" }: P & { fill?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 80" preserveAspectRatio="none" className={className}>
      <path d="M0 40c120 30 240 40 360 24S600 0 780 8s300 52 420 48 180-24 240-40v64H0V40Z" fill={fill} />
    </svg>
  );
}
