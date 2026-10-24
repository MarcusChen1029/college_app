// Minimal CSV writer. Student-controlled text (names, college names) goes into these files, so any cell that a
// spreadsheet could read as a formula is prefixed with an apostrophe (OWASP "CSV injection").

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Prefix the saved file with this so Excel reads it as UTF-8 (accented names survive). */
export const CSV_BOM = "\uFEFF";

/** Rows joined with CRLF, as RFC 4180 and Excel expect. */
export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
