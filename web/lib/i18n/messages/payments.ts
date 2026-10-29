// Plans and the admission-year pass: plan names, the pass name, and what the sign-in merge kept in this browser.
import type { Translation } from "../core.ts";

export const en = {
  "payments.planName.free": "Free",
  "payments.planName.senior": "Admission-year pass",
  "payments.passFor": "Fall {year} pass",
  "payments.mergeLeftover":
    "{n} of the colleges saved in this browser didn't fit the Free plan. They're still saved in this browser; buy the pass to add them to your account.",
} as const;

export const zhTW: Translation<typeof en> = {
  "payments.planName.free": "免費版",
  "payments.planName.senior": "入學年度方案",
  "payments.passFor": "{year} 秋季入學方案",
  "payments.mergeLeftover": "這個瀏覽器裡有 {n} 所學校超出免費版的上限，沒有加入帳號。它們仍保存在這個瀏覽器中；購買入學年度方案後即可加入帳號。",
};
