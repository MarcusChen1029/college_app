// /extension/connect: where the college application filler extension asks for its token (ExtensionConnect).
import type { Translation } from "../core.ts";

export const en = {
  "extension.notSetUp": "Extension sign-in isn't set up yet.",
  "extension.wrongLink": "This link didn't come from the extension.",
  "extension.wrongLinkBody": "Open the College application filler extension and choose Connect to start again.",
  "extension.signInTitle": "Sign in to continue",
  "extension.signInBody": "The College application filler extension is asking to connect. Sign in first, then you can allow or cancel.",
  "extension.studentsOnly": "This extension is for students.",
  "extension.roleTitle": "Choose your account type first",
  "extension.roleBefore": "Choose 'Student' first at",
  "extension.roleAfter": ", then click Sign in in the extension again.",
  "extension.roleGo": "Go to /welcome",
  "extension.title": "Connect the extension",
  "extension.name": "College application filler",
  "extension.consent":
    "wants to read your transcript (schools, courses, grades) and your activities and honors (Common App and UC). It cannot see anything else in your account.",
  "extension.signedInAs": "Signed in as",
  "extension.disconnectAnyTime": "You can disconnect it any time in Settings.",
  "extension.returning": "Returning to the extension…",
  "extension.allowing": "Allowing…",
  "extension.allow": "Allow",
} as const;

export const zhTW: Translation<typeof en> = {
  "extension.notSetUp": "擴充功能登入尚未設定。",
  "extension.wrongLink": "這個連結不是來自擴充功能。",
  "extension.wrongLinkBody": "請開啟「大學申請填寫工具」擴充功能，並選擇連接重新開始。",
  "extension.signInTitle": "登入以繼續",
  "extension.signInBody": "「大學申請填寫工具」擴充功能要求連接。請先登入，再選擇允許或取消。",
  "extension.studentsOnly": "這個擴充功能僅供學生使用。",
  "extension.roleTitle": "請先選擇帳號類型",
  "extension.roleBefore": "請先在",
  "extension.roleAfter": " 選擇「學生」，然後在擴充功能中再按一次登入。",
  "extension.roleGo": "前往 /welcome",
  "extension.title": "連接擴充功能",
  "extension.name": "大學申請填寫工具",
  "extension.consent": "想要讀取你的成績單（學校、課程、成績）以及你的課外活動與獎項（Common App 與 UC）。它無法讀取你帳號中的其他任何資料。",
  "extension.signedInAs": "目前登入帳號：",
  "extension.disconnectAnyTime": "你可以隨時在設定中中斷連接。",
  "extension.returning": "正在返回擴充功能…",
  "extension.allowing": "允許中…",
  "extension.allow": "允許",
};
