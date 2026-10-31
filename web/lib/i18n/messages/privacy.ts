// The /privacy page (Privacy Policy). Written against origin/main on 2026-10-29: every data item names its table or file
// in the comment above it, so the owner can check the page against the code. Full map: docs/legal/2026-10-29-privacy-data-map.md.
// DRAFT wording, not legal advice. Shaped for Taiwan's Personal Data Protection Act (PDPA) Art. 8 notice items.
import type { Translation } from "../core.ts";

export const en = {
  "privacy.title": "Privacy Policy",
  "privacy.intro":
    "This policy explains what personal data Trakur collects, why, who can see it, where it is kept and how you can see, change or delete it. It describes what the site actually does today.",

  "privacy.summary.title": "The short version",
  "privacy.summary.noAccount": "You can browse colleges without an account. Everything else you add is your choice.",
  "privacy.summary.noSale": "We don’t sell your data, show ads, or use analytics or tracking tools.",
  "privacy.summary.control":
    "Apart from us (we can reach the database to run the service) and the service providers listed below, your records are visible only to you and the people and apps you choose: a teacher whose code you enter, someone you send a share link, an extension or AI app you connect.",
  "privacy.summary.logins": "Saved application-system passwords are locked in your browser with a vault passphrase only you know, so we, teachers and an AI app you connect can’t open them; read the limits in [Security](/security#logins) before saving them. Or choose “This device only” in [Settings](/settings#passwords): then your passwords stay in that browser and never reach us.",
  "privacy.summary.delete": "You can change or delete most things yourself. To delete your whole account, [contact us](/contact).",

  // PDPA Art. 8: collector, purposes (codes 090, 135, 136), categories, period/region/recipients, rights, effect of not providing.
  "privacy.collect.title": "What we collect",
  "privacy.collect.p1": "We collect only what you enter or what the features you use need:",
  // auth.users (Supabase Auth default: email, Google profile in raw metadata, sessions with IP/user agent); our code reads id + email only (lib/student-store.ts).
  "privacy.collect.account":
    "<b>Account.</b> When you sign in with Google, we receive your email address and a Google account ID. Our sign-in provider (Supabase) also keeps the basic profile details Google sends, such as your name and profile picture, and sign-in records such as the IP address and browser used. The site itself uses only your email address.",
  // user_roles.role (0020); teacher_profiles.display_name, school, digest_enabled (0020, 0029).
  "privacy.collect.role": "<b>Role.</b> Whether you use Trakur as a student or a teacher. For teachers: the name and school you enter, and your email digest setting.",
  // student_profiles: gpa_unweighted, gpa_weighted, sat_total, act_composite, test_details, is_international, target_regions,
  // study_fields, interested, plan, reminder_emails, reminder_days (0001, 0005, 0009, 0010, 0014, 0036, 0037).
  "privacy.collect.profile":
    "<b>Profile and scores.</b> GPA, SAT, ACT and English test scores (with section scores and test dates), whether you are an international student, target regions, fields of study, colleges you’re interested in, your plan, and your reminder settings.",
  // student_colleges: institution_id, custom, plan_key, status, checklist (incl. essay_list), notes, aid_offer_usd (0001, 0017).
  "privacy.collect.list":
    "<b>Your college list.</b> The colleges you add (including ones you type in yourself), your application plan, status and decisions, checklist, essay titles, links and progress, your private notes and any financial-aid offers you record.",
  // Address + username: student_colleges.portal_url/_username (0007); student_profiles.portals {systems, campuses, custom, progress} (0013), stored as typed (not locked).
  // Password: portal_passwords (0040) holds only browser-locked "e1." values (0047; 0048 makes the table refuse anything else); portal_vaults (0047) holds the vault's wrapped keys,
  // salts, one-way check values, key id and iteration count. No passphrase, recovery code or readable password reaches the server.
  "privacy.collect.logins":
    "<b>Application-system logins</b>, only if you save them: the website address and username for systems such as the Common App, UC or a college portal, your done / not done marks, and the password. The address and username are stored as you type them. The password is stored only in locked form: your browser locks it with your vault passphrase before it is saved, and we keep that locked value together with the vault’s wrapped keys (copies of the vault key, each locked by your passphrase or your recovery code), salts, one-way check values (they let your browser tell a right passphrase from a wrong one without revealing it), a key id and an iteration count (how many rounds the lock uses). We never receive your passphrase, your recovery code or a readable password ([details](/security#logins)).",
  // student_profiles.password_storage (0049): only the choice is stored; device-mode passwords stay in the browser's IndexedDB.
  "privacy.collect.loginsDevice":
    "<b>Passwords kept on this device only.</b> If you choose “This device only” in [Settings](/settings#passwords), we don’t receive your passwords at all: they stay in your browser, and we store only that choice.",
  // transcript_schools (incl. school_code 0034), transcript_courses (0030).
  "privacy.collect.transcript":
    "<b>Transcript.</b> Your schools (name, country, school code, printed GPA, class rank, notes) and courses (year, level, subject, grades as printed, credits, notes).",
  // student_profiles.activities (0011, v2 0038), .essays (0018: status + Google Doc link, no essay text), .resume (0012).
  "privacy.collect.writing":
    "<b>Activities, essays and résumé.</b> Your activities and honors (descriptions, roles, hours, grades), essay progress and links to your Google Docs (we don’t store the essay text), and the résumé details you enter (name, email, phone, location, school, graduation year).",
  // recommenders (0026), scholarships (0027).
  "privacy.collect.people":
    "<b>Recommenders and scholarships.</b> Recommenders’ names, roles, notes and request dates; scholarships’ names, providers, amounts, deadlines, links, status and notes.",
  // classes, join_codes, teacher_links (share_essays), class_members, code_attempts (0021); teacher_notes (0024);
  // teacher_tasks, task_completions (0028).
  "privacy.collect.teacher":
    "<b>Teacher connections.</b> Which teachers and classes you joined and when, whether essays are shared, tasks a teacher assigns and when you complete them, notes a teacher writes about a student (visible only to that teacher), and failed code attempts (to stop guessing).",
  // share_links: token_hash, label, created_at, revoked_at, last_viewed_at (0032).
  "privacy.collect.share": "<b>Share links.</b> A scrambled fingerprint (hash) of each link, when it was made and turned off, and when it was last opened.",
  // reminder_log, scholarship_reminder_log (0005, 0027), teacher_digest_log (0029).
  "privacy.collect.email": "<b>Email records.</b> Which reminder or digest emails were sent to you and when.",
  // extension_tokens: token_hash, label, scopes, created_at, last_used_at, expires_at, revoked_at (0031, 0039).
  "privacy.collect.extension": "<b>Chrome extension connections.</b> A fingerprint (hash) of each extension key, what it may read, and when it was made, last used, expires or was revoked.",
  // google_tokens.refresh_token_encrypted (0016); essay title sent to Drive API (lib/google-docs.ts, lib/google-server.ts).
  "privacy.collect.google": "<b>Google Docs connection.</b> An encrypted Google refresh token (a long-lived key from Google), so Trakur can create new Docs for you.",
  // Supabase Auth OAuth 2.1 server grants (auth schema, not in our migrations); app/mcp, components/OAuthConsent.tsx.
  "privacy.collect.ai": "<b>AI connections.</b> Which AI apps you approved and when (kept by our sign-in provider).",
  // plan_orders: merchant_trade_no, ecpay_trade_no, entry_year, amount_twd, payment_type, payment_info (ATM bank code + virtual account /
  // CVS code, cleared on account deletion), paid_at, pass_from/until, payer (0045); pay_links; student_profiles.plan_windows (0045). No card data.
  "privacy.collect.p2":
    "<b>Payments.</b> If you buy a pass, we keep a record of the order: its date, amount, payment method (card, ATM or convenience store), the entry year, the trade numbers from us and from ECPay, and, for an ATM or convenience-store payment, the transfer account or payment code ECPay issued for it. Trakur never sees your card number or bank details; ECPay collects them on its own payment page (see [Who else receives it](/privacy#sharing)). We don’t ask for your date of birth or ID numbers, and we don’t track your location. If you don’t provide something, only the feature that needs it won’t work; sign-in needs a Google email address.",

  "privacy.use.title": "How we use it",
  "privacy.use.p1": "We use your data only to run Trakur for you:",
  "privacy.use.service": "to show and save your tracker across your devices;",
  // deadline-reminders Edge Function; reminder_emails default true (0005); teacher digest opt-in (0029).
  "privacy.use.reminders":
    "to send deadline and scholarship reminder emails (<b>on by default</b> for students; turn them off in [Settings](/settings#reminders)) and, for teachers who turn it on, a weekly digest;",
  "privacy.use.share": "to show your information to the teachers, share-link viewers, extension and AI apps you choose;",
  // teacher_outcomes (0033): GPA rounded, SAT/ACT, outcome, plan; only with >= 5 students.
  "privacy.use.charts": "to draw anonymous class charts for a teacher (scores and results without names, only when at least 5 students have results);",
  "privacy.use.safety": "to keep the service secure, prevent abuse and fix problems, and to answer your requests.",
  "privacy.use.p2":
    "We don’t sell or rent your data, use it for advertising or marketing profiles, or use it to train AI models. Under Taiwan’s Personal Data Protection Act, these purposes fall under customer management and service (090), information and communication services (135) and information and database management (136).",

  // teacher_students / teacher_roster / teacher_student / teacher_deadlines (0021, 0023); share_essays default true;
  // roster CSV (lib/roster-export.ts); teacher_digest (0029).
  "privacy.teachers.title": "What teachers can see",
  "privacy.teachers.p1":
    "A teacher sees you only after you enter their code. They then see your name and email address, when you were last active, your scores and GPA, English test, international and aid flags, target regions, interested colleges, your activities and honors, and each college on your list with its status, plan, checklist, deadlines and when you added or last changed it.",
  "privacy.teachers.p2":
    "While essay sharing is on (it is on by default; change it in [Settings](/settings#counselors)), they also see your essay titles and Google Doc links. The progress of each college’s essays stays visible either way. They never see your saved logins, private college notes, aid offers, transcript, recommenders, scholarships, or your résumé’s phone number and location.",
  "privacy.teachers.p3":
    "A teacher can download a roster spreadsheet with your name, email, scores, international status, checklist progress, next deadline and last-active date, and can get an optional weekly email listing students’ names with upcoming tasks and deadlines. When you leave a teacher, their access ends at once, but a file they already downloaded stays with them.",

  "privacy.sharing.title": "Who else receives it",
  // Supabase: DB + auth (ap-northeast-1); Vercel: hosting; Resend: api.resend.com (Edge Function); Google: sign-in, Drive API.
  "privacy.sharing.providers":
    "<b>Service providers</b> that run parts of Trakur for us and may process your data only for that: Supabase (database and sign-in), Vercel (website hosting), Resend (sending email: your address and the email’s content), Google (sign-in, and creating Google Docs: the essay title) and ECPay (綠界科技, which processes payments: it collects your card or bank details on its own page and tells us whether the payment went through, with its amount, method and trade numbers). If you send a payment link to a parent, whoever opens it sees your name (if you entered one), the pass and its price.",
  "privacy.sharing.chosen":
    "<b>People and apps you choose:</b> teachers you link (above), anyone with a share link you made, the Trakur extension in your own browser (it types your transcript or activities into the application websites you open), and AI apps you connect (below).",
  // parent_view / portfolio_view field lists (0032, 0038).
  "privacy.sharing.links":
    "A parent link shows your name, school, graduation year, your list with status, plans, checklist and essay progress and deadlines, and counts of recommenders and scholarships. A portfolio link shows your name, school, graduation year, activities and honors, and your scores unless you hide them. Neither shows your email, phone, logins, notes, aid offers, essay titles or links, or transcript.",
  "privacy.sharing.law": "<b>When the law requires it</b>, for example a court order, and only what is required.",

  // ai-context.ts (local, no logins/notes/aid); MCP tools lib/mcp/tools.ts read: profile, scores, list incl. notes + essay links,
  // deadlines, activities, résumé header (email, phone, location), transcript; write incl. delete_activity, delete_transcript_course.
  "privacy.ai.title": "AI features",
  "privacy.ai.copy":
    "<b>Copy for AI</b> builds a summary in your browser (profile, scores, activities and college list, without logins, notes or aid offers). You decide where to paste it; Trakur sends nothing to an AI.",
  "privacy.ai.connect":
    "<b>Connect AI</b> lets an AI app you approve, such as ChatGPT or Claude, use Trakur tools. They can read your profile, scores, college list (including your private notes on colleges, essay titles and links), deadlines, activities, résumé details (including email, phone and location) and transcript. They can change your profile and scores, add colleges and change their plan, status, notes and checklist, add and edit essays, change your résumé details, and add, change or <b>permanently delete</b> activities and transcript courses. They can’t remove a college or delete an essay.",
  "privacy.ai.token":
    "Trakur’s tools never read your saved logins, but the app’s token works like your own sign-in, so a misbehaving app could reach other data, including the links and usernames of saved logins. It can’t open saved passwords, which are locked with a passphrase it never has ([details](/security#ai)). Data the tools return goes to that AI company and is handled under its privacy policy. Disconnect an app on the [Connect AI](/connect-ai) page, or [ask us](/contact) to.",

  // Supabase ap-northeast-1; Vercel region not set in repo; Resend; Google.
  "privacy.storage.title": "Where your data is kept",
  "privacy.storage.p1":
    "Your account data is stored in Supabase’s data center in Tokyo, Japan. Our other providers (Vercel, Resend and Google) may process it in other countries, including the United States. By using Trakur you agree to this transfer outside Taiwan. Payments are handled by ECPay (綠界科技), a company in Taiwan, under its own privacy policy.",
  // localStorage college-tracker:v1 (lib/student-store.ts), sb-…-auth-token (supabase-js default), interest-quiz-v1 (lib/interest-quiz.ts),
  // cookie lang (lib/i18n/core.ts), cookie gdocs_oauth (app/api/google/start/route.ts).
  "privacy.storage.p2":
    "Some data stays in your browser. While you’re signed out, everything you enter (including login links and usernames, but not passwords) is saved only in this browser’s local storage, and moves to your account when you sign in. The browser also keeps your sign-in session, your interest-quiz answers (never sent to us), a language cookie and, for a few minutes while you connect Google Docs, a security cookie. If you use the Chrome extension, its key is kept in the extension’s own storage. There are no advertising or analytics cookies.",

  "privacy.retention.title": "How long we keep it",
  "privacy.retention.p1":
    "We keep your data while your account exists. What you delete in the app is deleted from our database. When your account is deleted, all of its data goes with it, including your list, transcript, logins, links and tokens. The one exception is payment records: for refunds, reconciliation with ECPay and tax, we keep each order’s date, amount, payment method, entry year and trade numbers for up to 5 years. When you delete your account, they are anonymized: the link to your account is removed, and any transfer account or payment code ECPay issued for the order is erased.",
  // reminder logs, revoked share_links / extension_tokens rows, archived classes/tasks: never purged (no retention job).
  // private.activities_backup_0038: no FK, survives account deletion -> must be deleted by hand.
  "privacy.retention.p2":
    "Some records stay until the account is deleted: email-sending records, turned-off share links and revoked extension keys (as fingerprints only), and archived classes and tasks. A one-time backup of activities made during a format upgrade on October 28, 2026 is kept separately; we delete your copy when we delete your account.",
  "privacy.retention.p3":
    "Copies in our providers’ logs and backups disappear on their own schedules. We can’t delete copies held by others: files a teacher downloaded, Google Docs in your own Drive, or conversations with an AI app.",

  "privacy.rights.title": "Your rights and choices",
  "privacy.rights.p1":
    "Under Taiwan’s Personal Data Protection Act you can ask to see your data, get a copy, correct or add to it, have us stop collecting, processing or using it, or delete it. People in other places (for example the EU or UK) may have similar rights; just ask.",
  // per-item deletes: student-store.ts; leave_teacher (0021); revoke_share_link (0032); revoke_extension_token (0031);
  // ConnectAi revokeGrant; reminders toggle AccountPanel.tsx. No account deletion / export in code.
  "privacy.rights.self": "Most of it you can do yourself:",
  "privacy.rights.edit": "edit or delete colleges, logins, transcript entries, activities, recommenders and scholarships in the app;",
  "privacy.rights.revoke":
    "in [Settings](/settings#reminders): turn off reminder emails or essay sharing, leave a teacher, turn off a parent link and disconnect extensions; turn off a portfolio link on the [Résumé](/tools/resume) page; disconnect AI apps on the [Connect AI](/connect-ai) page;",
  "privacy.rights.google": "remove Google Docs access in your Google Account (myaccount.google.com/connections).",
  "privacy.rights.contact":
    "There is no delete-account or download-everything button yet. For those, or anything else, [contact us](/contact) from the email address you sign in with. We answer requests to see or copy data within 15 days and requests to correct, stop or delete within 30 days, as Taiwan’s law requires; if we need longer, we’ll tell you why.",

  "privacy.minors.title": "Students under 18",
  "privacy.minors.p1":
    "Trakur is made for high-school students, so many users are minors. You must be at least 13 to create an account, and if you’re under 18, a parent or guardian should agree to your use of Trakur. We don’t ask for your age or date of birth.",
  "privacy.minors.p2":
    "If we learn that a child under 13 has an account, we will delete it. A parent or guardian can [contact us](/contact) to see, correct or delete their child’s data.",

  "privacy.security.title": "How we protect it",
  "privacy.security.p1":
    "Data travels over HTTPS, each account’s records are walled off in the database, and secrets for share links and extensions are stored only as hashes. No system is perfectly secure; [Security](/security) explains the protections and their limits, including how saved passwords are stored.",

  "privacy.changes.title": "Changes to this policy",
  "privacy.changes.p1":
    "When this policy changes, we update the date at the top. For significant changes, we’ll post a notice on the site before they apply.",

  "privacy.contact.title": "Contact",
  "privacy.contact.p1": "Questions or requests about your data: see [Contact](/contact).",
} as const;

export const zhTW: Translation<typeof en> = {
  "privacy.title": "隱私權政策",
  "privacy.intro": "本政策說明 Trakur 蒐集哪些個人資料、為什麼蒐集、誰看得到、存放在哪裡，以及你如何查看、修改或刪除。內容描述的是網站目前實際的做法。",

  "privacy.summary.title": "重點摘要",
  "privacy.summary.noAccount": "不需要帳號就能瀏覽學校資料。其他所有資料都由你決定要不要輸入。",
  "privacy.summary.noSale": "我們不販售你的資料、不放廣告，也不使用任何分析或追蹤工具。",
  "privacy.summary.control": "除了我們（為了營運服務可以存取資料庫）和下方列出的服務供應商之外，你的資料只有你自己，以及你選擇的人和應用程式看得到：你輸入其代碼的老師、你傳送分享連結的對象，以及你連接的擴充功能或 AI 應用程式。",
  "privacy.summary.logins": "儲存的申請系統密碼會先在你的瀏覽器中用只有你知道的保險箱主密碼鎖住，所以我們、老師和你連接的 AI 應用程式都無法開啟；儲存之前請先閱讀[資料安全](/security#logins)中說明的限制。你也可以在[設定](/settings#passwords)中選擇「只存在這台裝置」：密碼就只會留在那個瀏覽器中，完全不會傳給我們。",
  "privacy.summary.delete": "大部分資料你可以自己修改或刪除。如要刪除整個帳號，請[聯絡我們](/contact)。",

  "privacy.collect.title": "我們蒐集的資料",
  "privacy.collect.p1": "我們只蒐集你輸入的資料，或你使用的功能所需要的資料：",
  "privacy.collect.account":
    "<b>帳號。</b>你使用 Google 登入時，我們會取得你的電子郵件地址與 Google 帳號 ID。我們的登入服務商（Supabase）也會保存 Google 提供的基本個人資料（例如姓名與大頭貼），以及登入紀錄（例如使用的 IP 位址與瀏覽器）。網站本身只使用你的電子郵件地址。",
  "privacy.collect.role": "<b>身分。</b>你是以學生還是老師身分使用 Trakur。老師另有：你輸入的姓名與學校，以及電子郵件摘要的設定。",
  "privacy.collect.profile":
    "<b>個人檔案與成績。</b>GPA、SAT、ACT 與英文檢定成績（含各科分數與考試日期）、是否為國際生、目標地區、想讀的領域、有興趣的學校、你選的方案，以及提醒信設定。",
  "privacy.collect.list": "<b>學校清單。</b>你加入的學校（包括你自行輸入的學校）、申請方案、申請狀態與結果、待辦清單、文書標題、連結與進度、你的私人筆記，以及你記錄的財務補助金額。",
  "privacy.collect.logins":
    "<b>申請系統登入資料</b>（僅限你選擇儲存時）：Common App、UC 或學校申請入口等系統的網址與使用者名稱、你標記的完成／未完成，以及密碼。網址與使用者名稱照你輸入的內容儲存；密碼只以上鎖後的形式儲存：你的瀏覽器會先用你的保險箱主密碼把它鎖住才儲存，我們保存的是這個上鎖後的值，以及保險箱加密後的金鑰副本（分別被你的主密碼和復原碼鎖住）、隨機鹽值、單向的檢查值（讓瀏覽器分辨主密碼對不對，卻無法由它還原主密碼）、金鑰編號與運算回合數。我們不會收到你的主密碼、復原碼或可讀取的密碼（[詳細說明](/security#logins)）。",
  "privacy.collect.loginsDevice": "<b>只存在這台裝置的密碼。</b>如果你在[設定](/settings#passwords)中選擇「只存在這台裝置」，我們完全不會收到你的密碼：它們只留在你的瀏覽器中，我們只儲存你的這個選擇。",
  "privacy.collect.transcript": "<b>成績單。</b>你的學校（校名、國家、學校代碼、成績單上的 GPA、班級排名、備註）與課程（年度、程度、科目、成績單上的原始成績、學分、備註）。",
  "privacy.collect.writing":
    "<b>課外活動、文書與履歷。</b>你的課外活動與獎項（描述、職位、時數、年級）、文書進度與你的 Google 文件連結（我們不儲存文書內文），以及你輸入的履歷資料（姓名、電子郵件、電話、所在地、學校、畢業年份）。",
  "privacy.collect.people": "<b>推薦人與獎學金。</b>推薦人的姓名、身分、備註與請託日期；獎學金的名稱、提供單位、金額、截止日期、連結、狀態與備註。",
  "privacy.collect.teacher":
    "<b>與老師的連結。</b>你加入了哪些老師與班級、加入時間、是否分享文書、老師指派的任務與你完成的時間、老師對學生寫的筆記（只有該老師看得到），以及輸入錯誤的代碼嘗試紀錄（用來防止猜測代碼）。",
  "privacy.collect.share": "<b>分享連結。</b>每個連結的雜湊值（無法還原的指紋）、建立與關閉的時間，以及最後一次被開啟的時間。",
  "privacy.collect.email": "<b>寄信紀錄。</b>我們寄給你哪些提醒信或摘要信，以及寄送時間。",
  "privacy.collect.extension": "<b>Chrome 擴充功能連結。</b>每把擴充功能金鑰的雜湊值、它能讀取的範圍，以及建立、最後使用、到期或撤銷的時間。",
  "privacy.collect.google": "<b>Google 文件連結。</b>加密後的 Google 更新權杖（Google 發給的長期金鑰），讓 Trakur 可以為你建立新的文件。",
  "privacy.collect.ai": "<b>AI 連結。</b>你核准了哪些 AI 應用程式，以及核准時間（由我們的登入服務商保存）。",
  "privacy.collect.p2":
    "<b>付款。</b>你購買方案時，我們會保存這筆訂單的紀錄：付款日期、金額、付款方式（信用卡、ATM 或超商）、入學年度、我們與 ECPay 各自的交易編號；如果是 ATM 或超商付款，還有 ECPay 為這筆訂單發出的轉帳帳號或繳費代碼。Trakur 看不到你的卡號或銀行資料，這些由 ECPay 在它自己的付款頁面收取（見[還有誰會收到你的資料](/privacy#sharing)）。我們不會要求你提供出生日期或身分證字號，也不會追蹤你的位置。你不提供某項資料時，只有需要它的那個功能無法使用；登入則需要一個 Google 電子郵件地址。",

  "privacy.use.title": "我們如何使用",
  "privacy.use.p1": "我們只為了替你提供 Trakur 服務而使用你的資料：",
  "privacy.use.service": "顯示並儲存你的申請追蹤資料，讓你在不同裝置上使用；",
  "privacy.use.reminders": "寄送截止日期與獎學金提醒信（學生帳號<b>預設開啟</b>，可在[設定](/settings#reminders)關閉），以及寄送每週摘要信給開啟此功能的老師；",
  "privacy.use.share": "把你的資訊顯示給你選擇的老師、分享連結的檢視者、擴充功能與 AI 應用程式；",
  "privacy.use.charts": "為老師繪製匿名的班級圖表（不含姓名的成績與結果，且至少要有 5 位學生有結果才會顯示）；",
  "privacy.use.safety": "維護服務安全、防止濫用、修正問題，以及回覆你的請求。",
  "privacy.use.p2":
    "我們不會出售或出租你的資料，不會用於廣告或行銷剖析，也不會用來訓練 AI 模型。依台灣《個人資料保護法》，上述目的屬於「〇九〇 消費者、客戶管理與服務」、「一三五 資（通）訊服務」及「一三六 資（通）訊與資料庫管理」。",

  "privacy.teachers.title": "老師看得到的資料",
  "privacy.teachers.p1":
    "你輸入老師的代碼後，老師才看得到你。老師會看到你的姓名與電子郵件、最後活動時間、成績與 GPA、英文檢定、國際生與財務補助標記、目標地區、有興趣的學校、你的課外活動與獎項，以及你清單上每所學校的申請狀態、方案、待辦清單、截止日期與加入和最後修改的時間。",
  "privacy.teachers.p2":
    "文書分享開啟時（預設為開啟，可在[設定](/settings#counselors)變更），老師也會看到你的文書標題與 Google 文件連結。無論是否開啟，各校文書的進度都會顯示。老師絕對看不到你儲存的登入資料、對學校的私人筆記、財務補助金額、成績單、推薦人、獎學金，以及你履歷上的電話與所在地。",
  "privacy.teachers.p3":
    "老師可以下載學生名冊試算表，內含你的姓名、電子郵件、成績、國際生身分、待辦進度、下一個截止日期與最後活動日期；也可以選擇接收每週電子郵件，列出學生姓名與即將到期的任務和截止日期。你離開老師後，對方的存取權會立即結束，但對方已下載的檔案仍會留在對方手上。",

  "privacy.sharing.title": "還有誰會收到你的資料",
  "privacy.sharing.providers":
    "<b>服務供應商</b>：替我們營運 Trakur 部分功能，且只能為此處理你的資料，包括 Supabase（資料庫與登入）、Vercel（網站主機）、Resend（寄送電子郵件：你的地址與信件內容）、Google（登入，以及建立 Google 文件：文書標題），以及綠界科技 ECPay（處理付款：它在自己的頁面收取你的信用卡或銀行資料，只告訴我們這筆付款是否成功，以及金額、付款方式與交易編號）。如果你把付款連結傳給家長，打開連結的人會看到你的姓名（若你有填寫）、方案與價格。",
  "privacy.sharing.chosen":
    "<b>你選擇的人與應用程式</b>：你連結的老師（見上方）、拿到你分享連結的人、你自己瀏覽器裡的 Trakur 擴充功能（它會把你的成績單或課外活動填入你開啟的申請網站），以及你連接的 AI 應用程式（見下方）。",
  "privacy.sharing.links":
    "家長連結會顯示你的姓名、學校、畢業年份、學校清單及其申請狀態、方案、待辦與文書進度和截止日期，以及推薦人與獎學金的數量。作品集連結會顯示你的姓名、學校、畢業年份、課外活動與獎項，以及你的成績（除非你選擇隱藏）。兩者都不會顯示你的電子郵件、電話、登入資料、筆記、財務補助金額、文書標題或連結，以及成績單。",
  "privacy.sharing.law": "<b>法律要求時</b>，例如法院命令，且只提供被要求的部分。",

  "privacy.ai.title": "AI 功能",
  "privacy.ai.copy": "<b>複製給 AI</b> 會在你的瀏覽器裡產生摘要（個人檔案、成績、課外活動與學校清單，不含登入資料、筆記或財務補助金額）。貼到哪裡由你決定；Trakur 不會把任何資料送給 AI。",
  "privacy.ai.connect":
    "<b>連接 AI</b> 讓你核准的 AI 應用程式（例如 ChatGPT 或 Claude）使用 Trakur 的工具。它們可以讀取你的個人檔案、成績、學校清單（包括你對學校的私人筆記、文書標題與連結）、截止日期、課外活動、履歷資料（包括電子郵件、電話與所在地）與成績單。它們可以修改你的個人檔案與成績、加入學校並修改其申請方案、狀態、筆記與待辦清單、新增與編輯文書、修改履歷資料，以及新增、修改或<b>永久刪除</b>課外活動與成績單課程。它們無法移除學校或刪除文書。",
  "privacy.ai.token":
    "Trakur 的工具絕不會讀取你儲存的登入資料，但該應用程式拿到的權杖和你自己的登入狀態效力相同，所以行為不當的應用程式可能存取到其他資料，包括已儲存登入資料的連結與使用者名稱。它無法開啟已儲存的密碼，因為這些密碼是用它拿不到的主密碼鎖住的（[詳細說明](/security#ai)）。工具回傳的資料會送到該 AI 公司，並依其隱私權政策處理。你可以在[連接 AI](/connect-ai) 頁面中斷連結，或[請我們](/contact)處理。",

  "privacy.storage.title": "資料存放地點",
  "privacy.storage.p1": "你的帳號資料存放在 Supabase 位於日本東京的資料中心。我們的其他服務供應商（Vercel、Resend 與 Google）可能在其他國家（包括美國）處理這些資料。使用 Trakur 即表示你同意資料傳輸到台灣以外的地區。付款由台灣的綠界科技（ECPay）處理，適用它自己的隱私權政策。",
  "privacy.storage.p2":
    "有些資料會留在你的瀏覽器裡。未登入時，你輸入的所有內容（包括登入資料的連結與使用者名稱，但不包括密碼）只會存在這個瀏覽器的本機儲存空間，登入後才會移到你的帳號。瀏覽器也會保存你的登入狀態、興趣測驗的答案（不會傳給我們）、一個語言設定 cookie，以及連接 Google 文件時短暫存在幾分鐘的安全 cookie。如果你使用 Chrome 擴充功能，它的金鑰會存在擴充功能自己的儲存空間。我們沒有任何廣告或分析用的 cookie。",

  "privacy.retention.title": "保存期間",
  "privacy.retention.p1": "你的帳號存在期間，我們會保存你的資料。你在網站上刪除的內容，會從我們的資料庫刪除。帳號被刪除時，所有相關資料都會一併刪除，包括學校清單、成績單、登入資料、連結與金鑰。唯一的例外是付款紀錄：為了退款、與 ECPay 對帳以及稅務，我們會保存每筆訂單的付款日期、金額、付款方式、入學年度與交易編號，最長 5 年。你刪除帳號時，這些紀錄會去識別化：與你帳號的關聯會被移除，ECPay 為該訂單發出的轉帳帳號或繳費代碼也會被清除。",
  "privacy.retention.p2":
    "有些紀錄會保留到帳號刪除為止：寄信紀錄、已關閉的分享連結與已撤銷的擴充功能金鑰（只保留雜湊值），以及已封存的班級與任務。2026 年 10 月 28 日格式升級時另外留存了一份課外活動備份；刪除你的帳號時，我們也會刪除你在備份中的資料。",
  "privacy.retention.p3": "服務供應商的紀錄檔與備份中的副本，會依各自的時程消失。我們無法刪除他人持有的副本：老師已下載的檔案、你自己雲端硬碟裡的 Google 文件，或你與 AI 應用程式的對話。",

  "privacy.rights.title": "你的權利與選擇",
  "privacy.rights.p1": "依台灣《個人資料保護法》，你可以請求查詢或閱覽你的資料、製給複製本、補充或更正、停止蒐集、處理或利用，以及刪除。其他地區（例如歐盟或英國）的使用者也可能有類似權利，歡迎提出。",
  "privacy.rights.self": "大部分你都可以自己完成：",
  "privacy.rights.edit": "在網站上編輯或刪除學校、登入資料、成績單內容、課外活動、推薦人與獎學金；",
  "privacy.rights.revoke": "在[設定](/settings#reminders)關閉提醒信或文書分享、離開老師、關閉家長連結、中斷擴充功能；在[履歷](/tools/resume)頁面關閉作品集連結；在[連接 AI](/connect-ai) 頁面中斷 AI 應用程式；",
  "privacy.rights.google": "到你的 Google 帳戶（myaccount.google.com/connections）移除 Google 文件存取權。",
  "privacy.rights.contact":
    "目前還沒有「刪除帳號」或「下載全部資料」的按鈕。如有這些需求或其他請求，請用你登入時使用的電子郵件[聯絡我們](/contact)。依台灣法律規定，查詢或複製的請求我們會在 15 天內回覆，更正、停止利用或刪除的請求會在 30 天內回覆；如需延長，我們會告訴你原因。",

  "privacy.minors.title": "未滿 18 歲的學生",
  "privacy.minors.p1": "Trakur 是為高中生設計的，所以許多使用者是未成年人。你必須年滿 13 歲才能建立帳號；未滿 18 歲時，應取得家長或監護人同意後再使用 Trakur。我們不會詢問你的年齡或出生日期。",
  "privacy.minors.p2": "如果我們得知有未滿 13 歲的兒童建立了帳號，我們會刪除該帳號。家長或監護人可以[聯絡我們](/contact)，查看、更正或刪除孩子的資料。",

  "privacy.security.title": "我們如何保護資料",
  "privacy.security.p1": "資料透過 HTTPS 傳輸，每個帳號的資料在資料庫中彼此隔離，分享連結與擴充功能的金鑰只以雜湊值保存。沒有任何系統是絕對安全的；[資料安全](/security)頁面說明了各項保護措施與其限制，包括已儲存的密碼如何保存。",

  "privacy.changes.title": "政策的修改",
  "privacy.changes.p1": "本政策修改時，我們會更新頁首的日期。重大修改生效前，我們會在網站上公告。",

  "privacy.contact.title": "聯絡方式",
  "privacy.contact.p1": "對你的資料有疑問或請求，請見[聯絡我們](/contact)。",
};
