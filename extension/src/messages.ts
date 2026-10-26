import type { TranscriptResult } from "./auth.ts";
import type { CgGradeKey, CgGradePlan, CurrentYearPlan } from "../../web/lib/commonapp-fill.ts";
import type { PageResult } from "./commonapp/dom.ts";
import type { InsertResult } from "./assist/insert.ts";
import type { StarsRow } from "../../web/lib/stars-fill.ts";
import type { CsuSchoolPlan } from "../../web/lib/csu-fill.ts";
import type { CsuRunResult } from "./csu/run.ts";
import type { FillTarget } from "./commonapp/pages.ts";

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
  | { type: "starsFill"; row: StarsRow; scale: string | null }
  | { type: "csuFill"; plan: CsuSchoolPlan }
  | { type: "csuStop" };
export type AssistResponse =
  | { type: "ready"; path: string }
  | { type: "assistTarget"; label: string | null }
  | { type: "assistInsert"; result: InsertResult; label: string }
  /** year: the coursework page's `yr` (null on any other STARS page). */
  | { type: "starsPage"; year: number | null; existing: string[] }
  | { type: "starsFill"; ok: true; saved: boolean; blanks: string[] }
  | { type: "starsFill"; ok: false; error: string }
  | { type: "csuFill"; result: CsuRunResult }
  | { type: "csuStop" };

export type ExtensionMessage = PanelRequest | ContentMessage | AssistMessage;
