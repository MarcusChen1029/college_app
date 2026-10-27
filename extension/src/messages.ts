import type { TranscriptResult } from "./auth.ts";
import type { CgGradeKey, CgGradePlan, CurrentYearPlan } from "../../web/lib/commonapp-fill.ts";
import type { PageResult } from "./commonapp/dom.ts";
import type { InsertResult } from "./assist/insert.ts";
import type { StarsRow } from "../../web/lib/stars-fill.ts";
import type { CsuSchoolPlan } from "../../web/lib/csu-fill.ts";
import type { UcGradePlan } from "../../web/lib/uc-fill.ts";
import type { UcFillResult } from "./uc/fill.ts";
import type { UiucRow } from "../../web/lib/uiuc-fill.ts";
import type { UiucFillResult, UiucPageInfo } from "./uiuc/fill.ts";
import type { CsuRunResult } from "./csu/run.ts";
import type { FillTarget } from "./commonapp/pages.ts";
import type { StarsSchool } from "./stars/nav.ts";

export type { FillTarget } from "./commonapp/pages.ts";
export type { PageResult } from "./commonapp/dom.ts";

/** Panel -> background requests. Extended by later tasks (fill plan, page state). */
export type PanelRequest = { type: "signIn" } | { type: "signOut" } | { type: "loadTranscript" };

/** Background -> panel responses, keyed by request type. */
export type PanelResponse = { type: "signIn"; ok: boolean } | { type: "signOut" } | { type: "loadTranscript"; result: TranscriptResult };

export type FillMode = "replace" | "keep";

/** Extension -> content script (chrome.tabs.sendMessage). The content script fills only the page its tab is on. */
export type ContentMessage =
  | { type: "ready" }
  | { type: "stop" }
  | { type: "inspect"; target: FillTarget }
  | { type: "fill"; target: CgGradeKey; plan: CgGradePlan; mode: FillMode }
  | { type: "fill"; target: "current"; plan: CurrentYearPlan; mode: FillMode };

/** Content script -> extension. `ok: false` carries a sentence for the report (e.g. "Answer Yes on the Courses & Grades intro first"). */
export type ContentResponse =
  | { type: "ready"; path: string }
  | { type: "stop" }
  | { type: "inspect"; ok: true; existing: string[] }
  | { type: "inspect"; ok: false; error: string }
  | { type: "fill"; ok: true; result: PageResult }
  | { type: "fill"; ok: false; error: string };

/** Side panel -> fill assistant content script (UC, STARS, Cal State Apply, UIUC, UT). `advance` moves focus to the next box after. */
export type AssistMessage =
  | { type: "ready" }
  | { type: "assistTarget" }
  | { type: "assistInsert"; value: string; advance: boolean }
  | { type: "starsPage" }
  | { type: "starsFill"; row: StarsRow; scale: string | null; language: string | null }
  | { type: "csuFill"; plan: CsuSchoolPlan }
  | { type: "csuStop" }
  | { type: "ucPage" }
  | { type: "ucFill"; plan: UcGradePlan }
  /** STARS: the student's schools (read from Enter Schools), and the coursework page address of one school year. */
  | { type: "starsSchools" }
  | { type: "starsYearPath"; ceeb: string; year: number }
  /** UC grade page: click the school's "Enter courses & grades". */
  | { type: "ucOpenClasses"; grade: number; schoolName: string; schoolCode?: string }
  /** myIllini SRAR: which page this is, its school blocks and saved rows; add rows to one school block; press Save Progress. */
  | { type: "uiucPage" }
  | { type: "uiucFill"; area: number; rows: UiucRow[] }
  | { type: "uiucSave" };
export type AssistResponse =
  | { type: "ready"; path: string }
  | { type: "assistTarget"; label: string | null }
  | { type: "assistInsert"; result: InsertResult; label: string }
  /** year: the coursework page's `yr` (null on any other STARS page). */
  | { type: "starsPage"; year: number | null; kind: "intl" | "us" | null; existing: string[]; pageText: string; errors: string[] }
  | { type: "starsFill"; ok: true; saved: boolean; blanks: string[] }
  | { type: "starsFill"; ok: false; error: string }
  | { type: "csuFill"; result: CsuRunResult }
  | { type: "csuStop" }
  /** grade: the open "Enter courses & grades" page's grade level (null elsewhere); names: courses on it, or on a grade summary page. */
  | { type: "ucPage"; grade: number | null; names: string[]; pageText: string }
  | { type: "ucFill"; ok: true; result: UcFillResult }
  | { type: "ucFill"; ok: false; error: string }
  | { type: "starsSchools"; ok: true; schools: StarsSchool[] }
  | { type: "starsSchools"; ok: false; error: string }
  /** path: null when STARS offers no such year for the school (years: the ones it does offer). */
  | { type: "starsYearPath"; path: string | null; years: number[] }
  | { type: "ucOpenClasses"; ok: true }
  | { type: "ucOpenClasses"; ok: false; error: string }
  | { type: "uiucPage"; page: UiucPageInfo }
  | { type: "uiucFill"; ok: true; result: UiucFillResult }
  | { type: "uiucFill"; ok: false; error: string }
  | { type: "uiucSave"; ok: true }
  | { type: "uiucSave"; ok: false; error: string };

export type ExtensionMessage = PanelRequest | ContentMessage | AssistMessage;
