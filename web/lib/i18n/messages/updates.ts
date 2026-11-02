// The public data-updates log (/data-updates). The entries themselves (dates, titles, summaries in English and Chinese)
// are data in lib/data/refresh-log.json, not keys here.
import type { Translation } from "../core.ts";

export const en = {
  "updates.footerLink": "Data updates",
  "updates.title": "Data updates",
  "updates.lead": "Every number links to its official source; this is when we loaded or re-checked data.",
  "updates.perCollege": "Each college page also shows when its sources were last checked.",
  "updates.wrong": "Spotted a wrong or old number? [Tell us](/contact) which college it is and which official page shows the right one.",
  "updates.listLabel": "Data loads, newest first",
} as const;

export const zhTW: Translation<typeof en> = {
  "updates.footerLink": "資料更新",
  "updates.title": "資料更新紀錄",
  "updates.lead": "每個數字都連到官方來源；以下是我們載入或重新檢查資料的時間。",
  "updates.perCollege": "每所學校的頁面也會標示來源最近一次查閱的日期。",
  "updates.wrong": "發現錯誤或過期的數字？請[聯絡我們](/contact)，告訴我們是哪所學校，以及哪個官方頁面有正確的數字。",
  "updates.listLabel": "資料載入紀錄，由新到舊",
};
