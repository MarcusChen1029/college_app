import type { Translation } from "../core.ts";

// Ready-made questions for "Copy for AI" (lib/ai-prompts.ts) and the same questions as connector prompts.
// Every body ends with the same three sentences; `{language}` is filled with "English" or "Traditional Chinese (Taiwan)" from
// the UI language. The connector swaps the first sentence (lib/ai-prompts.ts, connectorBody), so keep it word for word.

export const en = {
  "ai.pack.title": "Ask any AI about your list",
  "ai.pack.intro": "Pick a question and we copy it together with your list. Paste it into ChatGPT, Claude or Gemini, free versions included. A very long list may be too long for some free chatbots to accept in one paste.",
  "ai.pack.copy": "Copy",
  "ai.pack.copied": "Copied. Paste it into your AI.",
  "ai.pack.passTag": "Pass",
  "ai.pack.emptyNote": "Your list is empty, so your AI will only see your profile. Add colleges first for better answers.",
  "ai.pack.detailsError": "Couldn't load the college details ({message}), so what you copy has the summary only for now.",
  "ai.pack.previewTitle": "What the pass adds",
  "ai.pack.previewBody":
    "With the admission-year pass your AI also gets sourced details for every college on your list: deadlines, essay prompts, cost and aid, each with a numbered link to the official page. Here are the first lines for one of yours:",
  "ai.pack.previewNone": "Add a US college to your list and we will show a real example here: the sourced details your AI gets with the pass.",
  "ai.pack.previewError": "Couldn't load the example. Try again in a moment.",
  "ai.pack.getPass": "Get the pass",
  "ai.prompt.due14.title": "What's due in the next 14 days?",
  "ai.prompt.due14.body":
    "What's due in the next 14 days on my list, and what's still missing for each? Group by date. Use only the information below. When a fact has a numbered source, cite it. Answer in {language}.",
  "ai.prompt.conflicts.title": "Check my plans for conflicts",
  "ai.prompt.conflicts.body":
    "Check my application plans for conflicts: more than one Early Decision, Restrictive or Single-Choice Early Action rules that clash with my other plans. Quote the rule you rely on. Use only the information below. When a fact has a numbered source, cite it. Answer in {language}.",
  "ai.prompt.balance.title": "Is my list balanced?",
  "ai.prompt.balance.body":
    "Is my list balanced? Sort my colleges into reach, target and likely using my scores and each college's admit rate (the international rate if I'm international). Explain each call in one line. Use only the information below. When a fact has a numbered source, cite it. Answer in {language}.",
  "ai.prompt.essayOverlap.title": "Which essays can I reuse?",
  "ai.prompt.essayOverlap.body":
    "Find supplemental essay prompts on my list that overlap enough to share one draft. Group them and say what each group asks. Use only the information below. When a fact has a numbered source, cite it. Answer in {language}.",
  "ai.prompt.costAid.title": "Compare cost and aid",
  "ai.prompt.costAid.body":
    "Compare cost and aid for international students across my list: published cost, need-based and merit aid, and proof-of-funding documents. Use only the information below. When a fact has a numbered source, cite it. Answer in {language}.",
  "ai.prompt.weekPlan.title": "Plan my week",
  "ai.prompt.weekPlan.body":
    "Make me a plan for this week: the 5 most important things to do, in order, with why. Use only the information below. When a fact has a numbered source, cite it. Answer in {language}.",
  "ai.prompt.weekly.title": "What changed this week?",
  "ai.prompt.weekly.body":
    "What changed on my list this week, and what needs attention next? Use only the information below. When a fact has a numbered source, cite it. Answer in {language}.",
} as const;

export const zhTW: Translation<typeof en> = {
  "ai.pack.title": "問任何 AI 關於你的清單",
  "ai.pack.intro": "選一個問題，我們會連同你的清單一起複製。貼到 ChatGPT、Claude 或 Gemini 就能用，免費版也可以。清單很長時，部分免費聊天機器人可能一次貼不下。",
  "ai.pack.copy": "複製",
  "ai.pack.copied": "已複製，貼到你的 AI 就能用。",
  "ai.pack.passTag": "方案",
  "ai.pack.emptyNote": "你的清單還是空的，AI 只會看到你的個人檔案。先加入學校，回答會更有用。",
  "ai.pack.detailsError": "無法載入學校詳細資料（{message}），所以目前複製的內容只有摘要。",
  "ai.pack.previewTitle": "入學年度方案多給了什麼",
  "ai.pack.previewBody": "有了入學年度方案，你的 AI 還會拿到清單上每所學校的有來源資料：截止日期、文書題目、費用與補助，每一項都附編號的官方連結。以下是你清單上其中一所學校的前幾行：",
  "ai.pack.previewNone": "把一所美國學校加入清單，這裡就會顯示真實範例：有了入學年度方案，你的 AI 會拿到的有來源資料。",
  "ai.pack.previewError": "無法載入範例，請稍後再試。",
  "ai.pack.getPass": "取得入學年度方案",
  "ai.prompt.due14.title": "未來 14 天有哪些截止？",
  "ai.prompt.due14.body": "我的清單上未來 14 天內有哪些截止日期？每一項還缺什麼？請依日期分組。只使用下方提供的資料；每個事實若有編號來源，請引用。請用 {language} 回答。",
  "ai.prompt.conflicts.title": "檢查我的申請方案有沒有衝突",
  "ai.prompt.conflicts.body":
    "檢查我的申請方案有沒有衝突：是否選了不只一所提前決定（ED），或是限制性提前行動、單一選擇提前行動的規定與我其他方案互相牴觸。請引用你依據的規定。只使用下方提供的資料；每個事實若有編號來源，請引用。請用 {language} 回答。",
  "ai.prompt.balance.title": "我的清單平衡嗎？",
  "ai.prompt.balance.body":
    "我的清單平衡嗎？請依我的成績和每所學校的錄取率（如果我是國際生，請用國際生錄取率），把我的學校分成衝刺校、目標校和保底校，並用一句話說明每個判斷。只使用下方提供的資料；每個事實若有編號來源，請引用。請用 {language} 回答。",
  "ai.prompt.essayOverlap.title": "哪些文書可以共用？",
  "ai.prompt.essayOverlap.body":
    "找出我清單上題目相近、可以共用同一份草稿的附加文書。請分組，並說明每一組在問什麼。只使用下方提供的資料；每個事實若有編號來源，請引用。請用 {language} 回答。",
  "ai.prompt.costAid.title": "比較費用與補助",
  "ai.prompt.costAid.body":
    "比較我清單上各校對國際生的費用與補助：公布的費用、依經濟需求給予的補助與獎學金，以及財力證明文件。只使用下方提供的資料；每個事實若有編號來源，請引用。請用 {language} 回答。",
  "ai.prompt.weekPlan.title": "幫我排這週的計畫",
  "ai.prompt.weekPlan.body": "幫我排這週的計畫：最重要的 5 件事，依順序列出，並說明原因。只使用下方提供的資料；每個事實若有編號來源，請引用。請用 {language} 回答。",
  "ai.prompt.weekly.title": "這週有什麼變動？",
  "ai.prompt.weekly.body": "我的清單這週有什麼變動？接下來最需要注意什麼？只使用下方提供的資料；每個事實若有編號來源，請引用。請用 {language} 回答。",
};
