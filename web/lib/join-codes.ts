// Join codes: 8 characters from A-Z and 2-9 (no 0/O/1/I/L), shown as XXXX-XXXX. Pure helpers; the
// database does the real validation (RPC preview_code / redeem_code, migration 0021).

export type CodePreview = {
  kind: "class" | "individual";
  teacherName: string;
  school: string | null;
  className: string | null;
  alreadyLinked: boolean;
};

export type CodeError = "invalid" | "rate_limited" | "failed";
export type CodeResult = { ok: true; preview: CodePreview } | { ok: false; error: CodeError };

/** Uppercases and drops spaces, dashes and anything else that isn't a letter or digit. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "k7m4qx2p" -> "K7M4-QX2P". Anything that isn't 8 characters is returned normalized, without a dash. */
export function formatCode(input: string): string {
  const c = normalizeCode(input);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** True when the text could be a code, so the UI can skip a round trip for obvious typos. */
export function isPlausibleCode(input: string): boolean {
  return /^[A-HJKMNP-Z2-9]{8}$/.test(normalizeCode(input)); // A-Z without I, L, O, plus 2-9
}

/** Turns the jsonb returned by preview_code / redeem_code into a CodeResult. Unknown shapes are "failed". */
export function parseCodeResult(raw: unknown): CodeResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "failed" };
  const r = raw as Record<string, unknown>;
  if (r.ok === true && (r.kind === "class" || r.kind === "individual") && typeof r.teacher_name === "string") {
    return {
      ok: true,
      preview: {
        kind: r.kind,
        teacherName: r.teacher_name,
        school: typeof r.school === "string" ? r.school : null,
        className: typeof r.class_name === "string" ? r.class_name : null,
        alreadyLinked: r.already_linked === true,
      },
    };
  }
  if (r.ok === false && (r.error === "invalid" || r.error === "rate_limited")) return { ok: false, error: r.error };
  return { ok: false, error: "failed" };
}

/** Student-facing wording for a failed attempt. */
export function codeErrorMessage(error: CodeError): string {
  if (error === "rate_limited") return "Too many tries. Please wait an hour and ask your teacher to check the code.";
  if (error === "invalid") return "That code isn't valid. Check it with your teacher; it may have expired or been replaced.";
  return "Something went wrong. Please try again.";
}
