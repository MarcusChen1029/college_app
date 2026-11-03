import type { Translation } from "../core.ts";

// Classroom (teacher <-> student conversations, announcements, tasks). Only the strings the shared conversation UI
// uses so far; later tasks add theirs here. Plain text only: bodies are rendered as text, never as markup.

export const en = {
  // what a conversation is about (anchor chips)
  "classroom.anchor.general": "General",
  "classroom.anchor.yours": "Your {section}",
  "classroom.anchor.theirs": "Their {section}",
  "classroom.anchor.section.colleges": "college list",
  "classroom.anchor.section.essays": "essays",
  "classroom.anchor.section.activities": "activities",
  "classroom.anchor.section.profile": "profile",
  "classroom.anchor.generic.section": "A section",
  "classroom.anchor.generic.college": "A college",
  "classroom.anchor.generic.essay": "An essay",
  "classroom.anchor.generic.activity": "An activity",
  "classroom.anchor.generic.profile": "A profile item",
  "classroom.anchor.generic.task": "A task",
  "classroom.anchor.unavailable": "no longer available",

  // errors
  "classroom.err.limit": "You've reached the limit for this. Archive or remove some items, then try again.",
  "classroom.err.notLinked": "You're no longer linked with this person.",
  "classroom.err.notFound": "That item is no longer available.",
  "classroom.err.invalid": "Please check the text and the link, then try again.",
  "classroom.err.rate": "You've reached today's limit. Please try again tomorrow.",
  "classroom.err.messageEmpty": "Write a message first.",
  "classroom.err.messageLong": "Keep the message under {n} characters.",

  // shared
  "classroom.retry": "Try again",
  "classroom.send": "Send",

  // who sees it
  "classroom.visible.teacher": "Only {name} and you can see this.",
  "classroom.visible.teacherAnon": "Only this student and you can see this.",
  "classroom.visible.student": "Only you and {name} can see this.",
  "classroom.visible.studentAnon": "Only you and your counselor can see this.",

  // a conversation
  "classroom.conv.loading": "Loading messages…",
  "classroom.conv.you": "You",
  "classroom.conv.removed": "Message removed",
  "classroom.conv.deleteAria": "Delete your message from {when}",
  "classroom.conv.confirmDelete": "Delete this message? It will be removed for both of you.",
  "classroom.conv.resolve": "Mark resolved",
  "classroom.conv.reopen": "Reopen",
  "classroom.conv.resolvedNote": "Marked resolved. A new message reopens it.",
  "classroom.conv.replyLabel": "Reply to {name}",
  "classroom.conv.replyPlaceholder": "Write a reply…",

  // a new conversation
  "classroom.new.title": "New message",
  "classroom.new.about": "About",
  "classroom.new.message": "Message",
} as const;

export const zhTW: Translation<typeof en> = {
  "classroom.anchor.general": "一般",
  "classroom.anchor.yours": "你的{section}",
  "classroom.anchor.theirs": "學生的{section}",
  "classroom.anchor.section.colleges": "學校清單",
  "classroom.anchor.section.essays": "文書",
  "classroom.anchor.section.activities": "課外活動",
  "classroom.anchor.section.profile": "個人檔案",
  "classroom.anchor.generic.section": "某個區塊",
  "classroom.anchor.generic.college": "某所學校",
  "classroom.anchor.generic.essay": "一篇文書",
  "classroom.anchor.generic.activity": "一項課外活動",
  "classroom.anchor.generic.profile": "一項個人檔案內容",
  "classroom.anchor.generic.task": "一項任務",
  "classroom.anchor.unavailable": "已無法使用",

  "classroom.err.limit": "已達上限。請封存或移除部分項目後再試一次。",
  "classroom.err.notLinked": "你已不再與對方連結。",
  "classroom.err.notFound": "找不到該項目，可能已被移除。",
  "classroom.err.invalid": "請檢查文字與連結後再試一次。",
  "classroom.err.rate": "你已達到今日的上限，請明天再試。",
  "classroom.err.messageEmpty": "請先輸入訊息。",
  "classroom.err.messageLong": "訊息請控制在 {n} 個字元以內。",

  "classroom.retry": "再試一次",
  "classroom.send": "送出",

  "classroom.visible.teacher": "只有 {name} 和你看得到。",
  "classroom.visible.teacherAnon": "只有這位學生和你看得到。",
  "classroom.visible.student": "只有你和 {name} 看得到。",
  "classroom.visible.studentAnon": "只有你和你的輔導老師看得到。",

  "classroom.conv.loading": "正在載入訊息…",
  "classroom.conv.you": "你",
  "classroom.conv.removed": "訊息已移除",
  "classroom.conv.deleteAria": "刪除你在 {when} 的訊息",
  "classroom.conv.confirmDelete": "要刪除這則訊息嗎？雙方都將看不到內容。",
  "classroom.conv.resolve": "標示為已解決",
  "classroom.conv.reopen": "重新開啟",
  "classroom.conv.resolvedNote": "已標示為已解決。送出新訊息會重新開啟。",
  "classroom.conv.replyLabel": "回覆 {name}",
  "classroom.conv.replyPlaceholder": "寫下你的回覆…",

  "classroom.new.title": "新訊息",
  "classroom.new.about": "關於",
  "classroom.new.message": "訊息",
};
