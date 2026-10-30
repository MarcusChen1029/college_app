// The /security page: plain-language description of how data is protected, written against origin/main on 2026-10-29.
// Every claim maps to code or a migration; the source is noted above each group. Saved portal passwords are locked in the
// browser (vault: lib/vault-*.ts, migration 0047); if that design changes, update the logins group and the AI group.
// DRAFT wording, not legal advice.
import type { Translation } from "../core.ts";

export const en = {
  "security.title": "Security",
  "security.intro":
    "This page explains in plain words how Trakur protects your data, and where the protection stops. It describes the site as it works today; we update it when that changes.",

  // HTTPS + HSTS: Vercel (live headers). Region: Supabase ap-northeast-1. RLS: 0001_init.sql "own profile" / "own list".
  "security.basics.title": "The basics",
  "security.basics.https": "Everything between your browser and Trakur travels over HTTPS (encrypted in transit). Plain http addresses are redirected to HTTPS.",
  "security.basics.storage": "Your data is stored in a Supabase database in Tokyo, Japan. Supabase encrypts its disks (encryption at rest).",
  "security.basics.rls":
    "Each student’s records can be read directly only with that student’s own sign-in. The database enforces this (row-level security), so other accounts can’t load your list, transcript or logins, apart from the limited teacher view described below for teachers you link.",
  "security.basics.google": "You sign in with Google. Trakur never sees or stores your Google password.",

  // Address + username: student_colleges.portal_url/_username (0007), student_profiles.portals (0013), stored as typed (not locked), RLS only.
  // Password: portal_passwords (0040, "e1." values from 0047) + portal_vaults (0047), locked in the browser (lib/vault-*.ts);
  // the server and database can't open them. Limits = design spec "Known limits". Signed out: localStorage, no passwords
  // (lib/student-store.ts). Excluded from teacher RPCs, share views, extension RPCs, emails, ai-context.ts.
  "security.logins.title": "Application-system logins (passwords)",
  "security.logins.p1":
    "If you save a login for the Common App, UC or another application system, Trakur stores the address and username as you typed them. <b>The password is locked in your browser, with a vault passphrase only you know, before it is saved.</b> Trakur’s servers and database hold only the locked version and can’t open it. The people who run Trakur can’t open it either, and neither can teachers, parent links or AI connections. Your passphrase and recovery code never leave your browser.",
  "security.logins.p2":
    "You create the passphrase, and a recovery code, when you set up the vault. <b>Nobody can reset the passphrase for you.</b> If you forget it, your recovery code opens the vault and lets you choose a new passphrase. If you lose both, nobody can get your passwords back: you can delete them in [Settings](/settings) and start over (links and usernames stay). Saving passwords is optional; you can also keep them somewhere else, such as a password manager.",
  "security.logins.p3":
    "<b>Where this protection stops.</b> Locking protects the passwords you save from now on against database leaks, stolen server keys and the people who run Trakur looking at the data. It has three limits. First, someone who copied the database could try to guess a weak passphrase offline, as many times as they like, so choose a long one (at least 10 characters is required; several unrelated words is better). Second, the site’s own code runs in your browser, so a changed (malicious) version of the site could capture a password as you type it; locking can’t protect against the site’s code itself being changed. Third, backups our database provider made before the vault existed (if any are kept) may still hold your older saved passwords, either unlocked or locked only with a key on our web server, until those backups expire.",
  "security.logins.p4":
    "Saved logins are never included in teacher views, share links, reminder emails, the Chrome extension or the “Copy for AI” text. While you’re signed out, the links and usernames you enter are kept only in this browser’s local storage, unencrypted, and passwords are not saved at all; don’t enter logins on a shared or public computer. Use a different password for each application system, and never your Google password.",

  // teacher_students / teacher_roster / teacher_student / teacher_deadlines (0021, 0023), share_essays default true (0021:34),
  // teacher_outcomes min 5 (0033), teacher_notes cascade (0024), role self-chosen (0020).
  "security.teachers.title": "What teachers and counselors can and can’t see",
  "security.teachers.p1":
    "A teacher sees you only after you enter their class code or personal code. Trakur doesn’t verify who teachers are, so only enter a code from a teacher or counselor you know.",
  "security.teachers.canTitle": "They can see:",
  "security.teachers.canName": "your name and email address;",
  "security.teachers.canScores":
    "your test scores (including section scores), unweighted GPA, English test, intended field, whether you’re international or need aid, target regions and the colleges you’re interested in;",
  "security.teachers.canList": "each college on your list with its status, application plan, checklist, deadlines and when you added or last changed it, and when you were last active;",
  "security.teachers.canActivities": "your activities and honors;",
  "security.teachers.canEssays": "your essay titles and Google Doc links, <b>unless you turn essay sharing off</b> in [Settings](/settings) (it is on by default). The progress of each college’s essays stays visible either way.",
  "security.teachers.cantTitle": "They can never see:",
  "security.teachers.cantLogins": "your saved application-system logins;",
  "security.teachers.cantNotes": "your private notes on colleges or your financial-aid offers;",
  "security.teachers.cantTranscript": "your transcript, recommenders or scholarships;",
  "security.teachers.cantResume": "your résumé’s phone number and location.",
  "security.teachers.p2":
    "Teachers can’t change any of your data. Class charts show only anonymous points, and only when at least 5 students have results. You can leave a teacher in Settings at any time: they lose access right away, and their private notes about you are deleted.",

  // extension_tokens: SHA-256 only (0031:4,12), 90 days (0031:16), scopes transcript[+activities] (0039), read-only RPCs,
  // extension/src/auth.ts sign-out = local only; never presses Submit (assist-content.ts); zip, not Web Store.
  "security.extension.title": "The Chrome extension",
  "security.extension.p1":
    "The extension never gets your Trakur sign-in. When you connect it, Trakur gives it a separate key that can only <b>read</b> your transcript (schools, courses, grades and notes) and, if you allowed it when connecting, your activities and honors (keys made before October 29, 2026, Taiwan time, can’t read these). It can’t read anything else, and it can’t change your Trakur data.",
  "security.extension.p2": "We keep only a one-way fingerprint (a SHA-256 hash) of that key, not the key itself. Keys expire after 90 days.",
  "security.extension.p3":
    "<b>Signing out in the extension only removes the key from that browser.</b> To cut it off completely, revoke it in [Settings](/settings) under Connected extensions.",
  "security.extension.p4":
    "On application websites, the extension works inside your own signed-in session there. It fills in fields and presses Save, never Submit, and it never receives the logins you saved in Trakur.",
  "security.extension.p5":
    "It is downloaded from the Tools page and loaded by hand. It isn’t on the Chrome Web Store yet and doesn’t update itself, so download it only from track-ur-college.com.",

  // share_links: SHA-256 only, no expiry, one active per kind (0032); parent_view / portfolio_view field lists (0032, 0038);
  // noindex + no-referrer meta (app/share/layout.tsx).
  "security.share.title": "Share links",
  "security.share.p1":
    "A parent link or portfolio link lets <b>anyone who has it</b> open a read-only page without signing in. Treat it like a password and send it only to people you trust.",
  "security.share.p2":
    "We store only a hash of the link’s secret part. Links don’t expire on their own: turn one off in [Settings](/settings) (parent link) or [Résumé](/tools/resume) (portfolio link). Making a new link turns off the old one.",
  "security.share.p3":
    "Share pages never show your email, phone, saved logins, notes, aid offers, essay titles or links, or transcript. The parent link shows essay progress, and the portfolio shows your scores unless you turn that off. Share pages ask search engines not to list them.",

  // google_tokens.refresh_token_encrypted, AES-256-GCM, server key, service_role only (0016, lib/google-docs.ts); scope drive.file.
  "security.google.title": "Google Docs",
  "security.google.p1":
    "If you connect Google Docs, Trakur asks only for access to the files it creates for you (Google’s “drive.file” permission). It can’t see the rest of your Google Drive.",
  "security.google.p2":
    "The access it receives from Google (a long-lived refresh token) is encrypted with AES-256-GCM, using a key kept in our web server’s settings, separate from the database. The encrypted token is kept in a table that no user account can read.",
  "security.google.p3": "To disconnect, remove Trakur from your Google Account’s list of third-party connections (myaccount.google.com/connections).",

  // ai-context.ts excludes logins/notes/aid; MCP tools read with *_NO_LOGINS column lists (lib/student-rows.ts, lib/mcp/tools.ts);
  // OAuth token is a user JWT, RLS doesn't check client_id (lib/mcp/claims.ts, auth.ts); revoke: ConnectAi.tsx revokeGrant.
  "security.ai.title": "AI connections",
  "security.ai.copy":
    "<b>Copy for AI:</b> you copy a summary yourself and paste it wherever you choose. It never includes saved logins, private notes or aid offers. Trakur doesn’t send anything to an AI on its own.",
  "security.ai.connect":
    "<b>Connect AI</b> (ChatGPT or Claude): you approve the connection on a Trakur page. Trakur’s AI tools can read and change your profile, list (including your private notes), essays, activities, résumé details (including email, phone and location) and transcript, and can permanently delete activities and transcript courses. They never read or change your saved logins.",
  "security.ai.limit":
    "The connection uses a sign-in token for your account, and today the database itself doesn’t stop that token from reaching data the tools don’t use, <b>including the links and usernames of your saved logins</b>, or from doing anything your own sign-in can do. Your saved passwords are the exception: they are locked with your vault passphrase, which never leaves your browser, so a token can’t open them. Connect only AI apps you trust, and disconnect them on the [Connect AI](/connect-ai) page when you no longer need them. A token that was already issued can keep working for a short time until it expires.",

  // Operator has Supabase admin + service-role key; processors listed in /privacy.
  "security.people.title": "Who can reach the database",
  "security.people.p1":
    "The operator has administrator access to the database, which is needed to run the service, fix problems and carry out requests such as deleting an account. We look at personal data only when one of those needs it.",
  "security.people.p2":
    "Our service providers (Supabase, Vercel, Resend and Google) run the systems Trakur is built on, under their own security programs. See the [Privacy Policy](/privacy#sharing).",

  "security.you.title": "What you can do",
  "security.you.google": "Turn on 2-Step Verification for your Google account.",
  "security.you.passwords": "Use a unique password for each application system, choose a long vault passphrase, and keep your recovery code somewhere safe outside Trakur, such as a password manager. Or don’t save passwords in Trakur at all.",
  "security.you.shared": "On a shared computer, sign out when you’re done, and don’t enter logins while signed out.",
  "security.you.revoke": "Revoke extensions, share links and AI connections you no longer use.",
  "security.you.essays": "Turn off essay sharing if you don’t want teachers to see your essay links.",

  "security.report.title": "Report a security problem",
  "security.report.p1":
    "Found a security problem? Email us what you found and how to reproduce it. Please don’t open, change or delete other people’s data, and give us reasonable time to fix it before telling others.",
} as const;

export const zhTW: Translation<typeof en> = {
  "security.title": "資料安全",
  "security.intro": "這一頁用白話說明 Trakur 如何保護你的資料，以及保護的範圍到哪裡為止。內容描述網站目前的實際運作方式，有變動時我們會更新。",

  "security.basics.title": "基本保護",
  "security.basics.https": "你的瀏覽器與 Trakur 之間的所有傳輸都經過 HTTPS 加密。輸入 http 開頭的網址會被自動轉到 HTTPS。",
  "security.basics.storage": "你的資料存放在位於日本東京的 Supabase 資料庫。Supabase 會加密其儲存硬碟（靜態加密）。",
  "security.basics.rls": "每位學生的資料只有用學生本人的登入狀態才能直接讀取。這由資料庫本身強制執行（列層級安全性，row-level security），所以其他帳號都無法讀取你的清單、成績單或登入資料；唯一的例外是你連結的老師，可以看到下方說明的有限資訊。",
  "security.basics.google": "你使用 Google 帳號登入。Trakur 不會看到、也不會儲存你的 Google 密碼。",

  "security.logins.title": "申請系統的登入資料（密碼）",
  "security.logins.p1":
    "如果你儲存 Common App、UC 或其他申請系統的登入資料，Trakur 會照你輸入的內容儲存網址與使用者名稱。<b>密碼在儲存之前，會先在你的瀏覽器中用只有你知道的保險箱主密碼鎖住。</b>Trakur 的伺服器和資料庫只保存上鎖後的版本，無法開啟；經營 Trakur 的人也無法開啟，老師、家長連結和 AI 連線同樣不行。你的主密碼和復原碼不會離開你的瀏覽器。",
  "security.logins.p2":
    "主密碼和復原碼是你在設定保險箱時建立的。<b>沒有人能幫你重設主密碼。</b>如果你忘了主密碼，用復原碼就能開啟保險箱，並選一組新的主密碼。如果兩者都遺失，沒有人能找回你的密碼：你可以到[設定](/settings)把它們刪除，重新開始（連結和使用者名稱會保留）。儲存密碼是選擇性的；你也可以改用其他方式保存，例如密碼管理工具。",
  "security.logins.p3":
    "<b>這項保護的界線。</b>上鎖可以保護你從現在起儲存的密碼，不因資料庫外洩、伺服器金鑰被盜，或經營 Trakur 的人查看資料而被讀取。但它有三個限制。第一，拿到資料庫副本的人，可以在離線狀態下不限次數地猜測太弱的主密碼，所以請設定較長的主密碼（至少要 10 個字元，用幾個不相關的詞組成更好）。第二，網站本身的程式碼是在你的瀏覽器裡執行的，所以被竄改（惡意）的網站版本，可能在你輸入密碼時把它攔截下來；上鎖無法防範網站程式碼本身被改動。第三，我們資料庫服務商在保險箱出現之前做的備份（如果有保留的話），可能還留有你舊的已儲存密碼，那些密碼是未上鎖的，或只用我們網站伺服器上的金鑰鎖住，直到這些備份到期為止。",
  "security.logins.p4":
    "已儲存的登入資料絕不會出現在老師的檢視畫面、分享連結、提醒信、Chrome 擴充功能或「複製給 AI」的文字中。未登入時，你輸入的連結和使用者名稱只會以未加密的形式存在這個瀏覽器的本機儲存空間，密碼則完全不會儲存；請不要在共用或公用電腦上輸入登入資料。每個申請系統請使用不同的密碼，也絕對不要使用你的 Google 密碼。",

  "security.teachers.title": "老師與升學輔導老師看得到與看不到的資料",
  "security.teachers.p1": "你輸入老師的班級代碼或個人代碼之後，老師才看得到你。Trakur 不會驗證老師的身分，所以請只輸入你認識的老師或升學輔導老師給你的代碼。",
  "security.teachers.canTitle": "老師看得到：",
  "security.teachers.canName": "你的姓名與電子郵件；",
  "security.teachers.canScores": "你的考試成績（包括各科分數）、未加權 GPA、英文檢定、想讀的領域、是否為國際生或需要財務補助、目標地區，以及你有興趣的學校；",
  "security.teachers.canList": "你學校清單上的每所學校，以及其申請狀態、申請方案、待辦清單、截止日期與加入和最後修改的時間，還有你最後活動的時間；",
  "security.teachers.canActivities": "你的課外活動與獎項；",
  "security.teachers.canEssays": "你的文書標題與 Google 文件連結，<b>除非你關閉文書分享</b>（可在[設定](/settings)變更，預設為開啟）。無論是否開啟，各校文書的進度都會顯示。",
  "security.teachers.cantTitle": "老師絕對看不到：",
  "security.teachers.cantLogins": "你儲存的申請系統登入資料；",
  "security.teachers.cantNotes": "你對各校的私人筆記或財務補助金額；",
  "security.teachers.cantTranscript": "你的成績單、推薦人或獎學金；",
  "security.teachers.cantResume": "你履歷上的電話與所在地。",
  "security.teachers.p2":
    "老師無法修改你的任何資料。班級圖表只顯示匿名的資料點，而且至少要有 5 位學生有結果才會顯示。你隨時可以在設定中離開老師：對方會立即失去存取權，老師寫的關於你的私人筆記也會被刪除。",

  "security.extension.title": "Chrome 擴充功能",
  "security.extension.p1":
    "擴充功能永遠拿不到你的 Trakur 登入狀態。連接時，Trakur 會給它一把獨立的金鑰，這把金鑰只能<b>讀取</b>你的成績單（學校、課程、成績與備註），以及在你連接時允許的情況下，讀取你的課外活動與獎項（台灣時間 2026 年 10 月 29 日以前建立的金鑰無法讀取這些）。它讀不到其他資料，也無法修改你在 Trakur 的資料。",
  "security.extension.p2": "我們只保存這把金鑰的單向指紋（SHA-256 雜湊值），不保存金鑰本身。金鑰 90 天後失效。",
  "security.extension.p3": "<b>在擴充功能裡登出，只會把金鑰從那個瀏覽器移除。</b>如要完全切斷，請到[設定](/settings)的「已連接的擴充功能」撤銷。",
  "security.extension.p4": "在申請網站上，擴充功能是在你自己已登入的工作階段中運作。它會填入欄位並按下儲存，絕不會按送出，也拿不到你存在 Trakur 的登入資料。",
  "security.extension.p5": "擴充功能是從工具頁面下載後手動載入的。它目前還沒有上架 Chrome 線上應用程式商店，也不會自動更新，所以請只從 track-ur-college.com 下載。",

  "security.share.title": "分享連結",
  "security.share.p1": "家長連結或作品集連結讓<b>任何拿到連結的人</b>不需登入就能開啟唯讀頁面。請把它當成密碼，只傳給你信任的人。",
  "security.share.p2":
    "我們只保存連結中秘密部分的雜湊值。連結不會自動失效：家長連結可在[設定](/settings)關閉，作品集連結可在[履歷](/tools/resume)關閉。建立新連結時，舊連結會自動失效。",
  "security.share.p3": "分享頁面絕不會顯示你的電子郵件、電話、登入資料、筆記、財務補助金額、文書標題或連結，以及成績單。家長連結會顯示文書進度；作品集會顯示你的成績，除非你關閉這個選項。分享頁面會要求搜尋引擎不要收錄。",

  "security.google.title": "Google 文件",
  "security.google.p1": "如果你連接 Google 文件，Trakur 只會要求存取它為你建立的檔案（Google 的「drive.file」權限），看不到你 Google 雲端硬碟裡的其他檔案。",
  "security.google.p2": "Trakur 從 Google 取得的授權（長期有效的更新權杖）會以 AES-256-GCM 加密，金鑰保存在網站伺服器的設定中、與資料庫分開，加密後的權杖則存放在任何使用者帳號都無法讀取的資料表中。",
  "security.google.p3": "如要中斷連接，請到你 Google 帳戶的第三方連結清單（myaccount.google.com/connections）移除 Trakur。",

  "security.ai.title": "AI 連結",
  "security.ai.copy": "<b>複製給 AI：</b>由你自己複製摘要，貼到你選擇的地方。內容絕不包含登入資料、私人筆記或財務補助金額。Trakur 不會主動把任何資料送給 AI。",
  "security.ai.connect":
    "<b>連接 AI</b>（ChatGPT 或 Claude）：你要在 Trakur 的頁面上核准連結。Trakur 的 AI 工具可以讀取和修改你的個人檔案、學校清單（包括你的私人筆記）、文書、課外活動、履歷資料（包括電子郵件、電話與所在地）與成績單，也可以永久刪除課外活動與成績單課程。它們絕不會讀取或修改你儲存的登入資料。",
  "security.ai.limit":
    "這個連結使用的是你帳號的登入權杖，而目前資料庫本身並不會阻止這個權杖存取 AI 工具用不到的資料（<b>包括你已儲存登入資料的連結與使用者名稱</b>），或做任何你自己登入後能做的事。唯獨你儲存的密碼例外：它們是用只留在你瀏覽器裡的保險箱主密碼鎖住的，權杖無法開啟。請只連接你信任的 AI 應用程式，不再需要時請到[連接 AI](/connect-ai) 頁面中斷連結。已經發出的權杖在到期前可能還會短暫有效。",

  "security.people.title": "誰能存取資料庫",
  "security.people.p1": "經營者擁有資料庫的管理權限，這是營運服務、修正問題，以及處理刪除帳號等請求所必需的。只有在這些情況需要時，我們才會查看個人資料。",
  "security.people.p2": "我們的服務供應商（Supabase、Vercel、Resend 與 Google）在它們各自的安全制度下，營運 Trakur 所使用的系統。詳見[隱私權政策](/privacy#sharing)。",

  "security.you.title": "你可以做的事",
  "security.you.google": "為你的 Google 帳號開啟兩步驟驗證。",
  "security.you.passwords": "每個申請系統使用不同的密碼，設定較長的保險箱主密碼，並把復原碼保存在 Trakur 以外的安全地方，例如密碼管理工具。或乾脆不要把密碼存在 Trakur。",
  "security.you.shared": "在共用電腦上用完請登出，未登入時也不要輸入登入資料。",
  "security.you.revoke": "撤銷不再使用的擴充功能、分享連結與 AI 連結。",
  "security.you.essays": "如果不想讓老師看到文書連結，請關閉文書分享。",

  "security.report.title": "回報安全問題",
  "security.report.p1": "發現安全問題嗎？請來信告訴我們你發現了什麼、如何重現。請不要開啟、修改或刪除其他人的資料，並在公開之前給我們合理的時間修正。",
};
