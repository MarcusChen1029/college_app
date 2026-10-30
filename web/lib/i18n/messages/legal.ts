// Legal chrome (footer links, sign-in consent, shared page bits), the Terms of Service and the Contact page.
// Privacy Policy text is in privacy.ts, the Security page in security.ts. Operator name / email / date: lib/legal.ts.
// DRAFT wording, not legal advice: the owner (or a lawyer) reviews it before relying on it.
import type { Translation } from "../core.ts";

export const en = {
  "legal.footer.label": "Site links",
  "legal.footer.privacy": "Privacy",
  "legal.footer.terms": "Terms",
  "legal.footer.security": "Security",
  "legal.footer.contact": "Contact",
  "legal.signIn.consent": "By continuing, you agree to the [Terms of Service](/terms) and the [Privacy Policy](/privacy).",
  "legal.updated": "Last updated: {date}",
  "legal.contents": "On this page",
  "legal.backToContents": "Back to contents",
  "legal.operator.named": "Trakur (track-ur-college.com) is run by {name}, an individual in Taiwan (“we” or “us” on these pages).",
  "legal.operator.unnamed": "Trakur (track-ur-college.com) is run by an individual in Taiwan (“we” or “us” on these pages). The operator’s full name will be listed here.",

  "legal.contact.title": "Contact",
  "legal.contact.intro": "Questions, bug reports, privacy requests or a wrong number on a college page: write to us.",
  "legal.contact.emailLabel": "Email:",
  "legal.contact.emailPending": "a contact email address will be posted here soon",
  "legal.contact.topicsTitle": "What to include",
  "legal.contact.topicPrivacy":
    "<b>Privacy requests</b> (see, correct, copy or delete your data, or close your account): write from the email address you sign in with, so we can find the account. A parent or guardian can ask about a minor’s data; tell us the student’s sign-in email.",
  "legal.contact.topicSecurity":
    "<b>Security problems</b>: what you found and how to reproduce it. Please don’t open or change other people’s data while testing. See [Security](/security).",
  "legal.contact.topicData": "<b>Wrong college data</b>: the college, the number, and the official page that shows the right value.",
  "legal.contact.topicBug": "<b>Bugs</b>: the page address, what you did, and what happened.",
  "legal.contact.never": "We will never ask for your Google password or your application-system passwords.",
  "legal.contact.help": "Many questions are already answered on the [Help](/help) page.",

  "legal.terms.title": "Terms of Service",
  "legal.terms.intro":
    "These terms are the agreement between you and us when you use track-ur-college.com, the Trakur Chrome extension and Trakur’s AI connector. Read them together with the [Privacy Policy](/privacy). By signing in or using Trakur, you agree to them.",
  "legal.terms.who.title": "Who can use Trakur",
  "legal.terms.who.p1": "Trakur is made for students applying to college and for the teachers and counselors who help them. You must be at least 13 years old to create an account.",
  "legal.terms.who.p2":
    "If you are under 18 (a minor under Taiwan law), use Trakur only with the agreement of a parent or guardian, who accepts these terms for you. Parents and guardians can [contact us](/contact) to see or delete their child’s data.",
  "legal.terms.account.title": "Your account",
  "legal.terms.account.p1": "You sign in with Google. Keep your Google account secure: anything done while signed in to your Trakur account is treated as done by you.",
  "legal.terms.account.p2": "Each account is either a student or a teacher account. Use your own account; don’t share it or sign in as someone else.",
  "legal.terms.what.title": "What Trakur is, and what it isn’t",
  "legal.terms.what.p1":
    "Trakur is a tool for organizing applications and reading college information. It is not affiliated with or endorsed by any college or by the Common App, the University of California, Cal State Apply, ApplyTexas, STARS, UCAS or any other application system.",
  "legal.terms.what.data":
    "<b>College data can be wrong or out of date.</b> We link a source for every number, but colleges change deadlines, requirements and costs. Always confirm on the college’s own website before you apply.",
  "legal.terms.what.estimates": "<b>Fit labels, tiers and GPA percentiles are estimates</b>, not predictions or promises. Nothing on Trakur guarantees admission, aid or a scholarship.",
  "legal.terms.what.reminders": "<b>Reminders can fail or arrive late</b> (email delivery, a wrong date in your list). Meeting your deadlines is your responsibility.",
  "legal.terms.what.advice": "Trakur is not professional counseling, legal, immigration or financial advice.",
  "legal.terms.content.title": "Your content",
  "legal.terms.content.p1":
    "What you enter (your profile, list, transcript, essays, activities, notes) stays yours. You let us store, copy and show it only as needed to run Trakur for you, for example to show it to a teacher you linked or on a share link you made.",
  "legal.terms.content.p2":
    "Only enter information you have the right to share. If you add details about other people, such as a recommender’s name and role, make sure they are fine with it.",
  "legal.terms.portals.title": "Application-system logins and the Chrome extension",
  "legal.terms.portals.p1":
    "Saving your application-system logins in Trakur is optional. If you do, it is your choice and your risk; [Security](/security) explains how they are stored. Follow each application system’s own rules.",
  "legal.terms.portals.p2":
    "The Trakur extension fills in forms on application websites (such as courses and grades) from your Trakur data. Check everything it entered before you submit. You submit your applications, not Trakur, and you are responsible for what they contain.",
  "legal.terms.teachers.title": "Teachers and counselors",
  "legal.terms.teachers.p1":
    "A teacher sees a student only after the student enters the teacher’s code, and only the information listed in the [Privacy Policy](/privacy#teachers). Teachers may use it only to advise their students, must keep it confidential, and must not copy it elsewhere without the student’s permission (and a parent’s, for a minor).",
  "legal.terms.teachers.p2": "A student can leave a teacher at any time, and the teacher then loses access.",
  "legal.terms.use.title": "Acceptable use",
  "legal.terms.use.p1": "Don’t use Trakur to:",
  "legal.terms.use.law": "break the law or anyone else’s rights;",
  "legal.terms.use.access": "get into another person’s account or data, or probe our security without permission (report problems instead; see [Security](/security#report));",
  "legal.terms.use.abuse": "overload, scrape or disrupt the site, its database or its AI connector;",
  "legal.terms.use.content": "upload malware, or content that is unlawful, hateful or harassing;",
  "legal.terms.use.impersonate": "pretend to be someone else, including a teacher or a school.",
  "legal.terms.use.p2": "We may suspend or close an account that breaks these rules, and we’ll tell you why unless the law or someone’s safety stops us.",
  "legal.terms.plans.title": "Plans and payments",
  "legal.terms.plans.p1": "Trakur has two plans (see [Pricing](/pricing)):",
  "legal.terms.plans.free": "<b>Free:</b> up to 5 colleges on your list, and the basic Copy for AI summary.",
  "legal.terms.plans.pass":
    "<b>Admission-year pass:</b> NT$990 (New Taiwan dollars, TWD), paid once. It is not a subscription and does not renew. It gives you an unlimited college list, the full Copy for AI context, Connect AI and the application filler extension.",
  "legal.terms.plans.validity":
    "You choose the year you will start college, for example Fall 2027. The pass is valid from its start date until July 31 of that year (Taiwan time, that day included). It starts on the day you pay or, if you buy early, on January 1 of the year before that entry year. Paying before that date is a pre-order: you pay now, the pass starts on its start date, and you stay on the Free plan until then unless another pass of yours is active. A pass ends on its end date even if you are still applying afterwards. Your account then goes back to the Free plan automatically: nothing is deleted, but the paid features stop and you can’t add colleges while your list is over the Free limit.",
  "legal.terms.plans.activation":
    "Your pass is activated as soon as ECPay confirms your payment (a pre-order starts on its start date). You agree to this by ticking a box at checkout. Because this is a digital service that starts at your request, the 7-day right to cancel a distance sale does not apply, under Taiwan’s rules on reasonable exceptions to the right of rescission in distance sales (《通訊交易解除權合理例外情事適用準則》).",
  "legal.terms.plans.refund":
    "On top of that, we give a full refund if you ask within 7 days of paying. Write to us through [Contact](/contact) with the email you sign in with and the date you paid. We refund the whole amount through ECPay; how soon it reaches you depends on ECPay and your bank or card issuer. If a parent paid, the refund goes back to the parent’s payment. A refunded pass ends. If the same entry year is paid for twice by mistake, we refund the extra payment.",
  "legal.terms.plans.processor":
    "Payments are handled by ECPay (綠界科技). You pay by credit card, ATM transfer or convenience store on ECPay’s own page, and your card number never reaches Trakur. A parent or anyone else can pay for you through a payment link you send them; they don’t need an account, and the pass is then added to your account. What we keep about payments is explained under [How long we keep it](/privacy#retention) in the Privacy Policy.",
  "legal.terms.others.title": "Other services",
  "legal.terms.others.p1":
    "Trakur relies on other companies’ services: Google (sign-in and Google Docs), Supabase (database and accounts), Vercel (hosting), Resend (email) and ECPay (payments). If you connect an AI app such as ChatGPT or Claude, or paste Trakur data into one, that app’s own terms and privacy policy cover what it does with your data.",
  "legal.terms.changes.title": "Changes, outages and leaving",
  "legal.terms.changes.p1":
    "Trakur is a small service that is still being built. Features may change or be removed, and the site may sometimes be unavailable. We’ll try to give notice before removing something you rely on.",
  "legal.terms.changes.p2": "You can stop using Trakur at any time. To close your account and delete your data, see [Your rights and choices](/privacy#rights).",
  "legal.terms.liability.title": "Disclaimer and limits of liability",
  "legal.terms.liability.p1":
    "Trakur is provided “as is”. As far as Taiwan law allows, we are not responsible for indirect or consequential losses, such as a missed deadline, an admission or aid decision, or the loss of data you did not keep elsewhere.",
  "legal.terms.liability.p2":
    "Nothing in these terms limits rights you have under Taiwan’s Consumer Protection Act or other laws that can’t be waived, or our liability for intentional acts or gross negligence.",
  "legal.terms.law.title": "Governing law",
  "legal.terms.law.p1":
    "These terms are governed by the laws of Taiwan (Republic of China). Unless the law says otherwise, the Taiwan Taipei District Court is the court of first instance for any dispute.",
  "legal.terms.updates.title": "Changes to these terms",
  "legal.terms.updates.p1":
    "We may update these terms; the date at the top shows the current version. For significant changes, we’ll post a notice on the site before they apply. If you keep using Trakur after that, the new terms apply.",
  "legal.terms.contact.title": "Contact",
  "legal.terms.contact.p1": "Questions about these terms: see [Contact](/contact).",
} as const;

export const zhTW: Translation<typeof en> = {
  "legal.footer.label": "網站連結",
  "legal.footer.privacy": "隱私權政策",
  "legal.footer.terms": "服務條款",
  "legal.footer.security": "資料安全",
  "legal.footer.contact": "聯絡我們",
  "legal.signIn.consent": "繼續即表示你同意[服務條款](/terms)與[隱私權政策](/privacy)。",
  "legal.updated": "最後更新：{date}",
  "legal.contents": "本頁內容",
  "legal.backToContents": "回到本頁內容",
  "legal.operator.named": "Trakur（track-ur-college.com）由在台灣的個人 {name} 經營（本頁中稱「我們」）。",
  "legal.operator.unnamed": "Trakur（track-ur-college.com）由一位在台灣的個人經營（本頁中稱「我們」）。經營者的完整姓名將公布於此。",

  "legal.contact.title": "聯絡我們",
  "legal.contact.intro": "有問題、要回報錯誤、提出個資請求，或發現學校頁面上的數字有誤，都歡迎來信。",
  "legal.contact.emailLabel": "電子郵件：",
  "legal.contact.emailPending": "聯絡用電子郵件地址即將公布於此",
  "legal.contact.topicsTitle": "來信時請附上",
  "legal.contact.topicPrivacy":
    "<b>個資請求</b>（查詢、更正、取得副本或刪除你的資料，或關閉帳號）：請用你登入時使用的電子郵件來信，方便我們找到帳號。家長或監護人可以詢問未成年子女的資料，請告訴我們學生登入用的電子郵件。",
  "legal.contact.topicSecurity": "<b>安全問題</b>：你發現了什麼、如何重現。測試時請不要開啟或修改其他人的資料。詳見[資料安全](/security)。",
  "legal.contact.topicData": "<b>學校資料有誤</b>：哪所學校、哪個數字，以及顯示正確數值的官方網頁。",
  "legal.contact.topicBug": "<b>程式錯誤</b>：網頁網址、你做了什麼、發生了什麼。",
  "legal.contact.never": "我們絕不會向你索取 Google 密碼或任何申請系統的密碼。",
  "legal.contact.help": "許多問題在[說明](/help)頁面已有解答。",

  "legal.terms.title": "服務條款",
  "legal.terms.intro":
    "本條款是你使用 track-ur-college.com、Trakur Chrome 擴充功能與 Trakur AI 連接器時，你與我們之間的約定。請與[隱私權政策](/privacy)一併閱讀。登入或使用 Trakur，即表示你同意本條款。",
  "legal.terms.who.title": "誰可以使用 Trakur",
  "legal.terms.who.p1": "Trakur 是為申請大學的學生，以及協助他們的老師與升學輔導老師設計的。你必須年滿 13 歲才能建立帳號。",
  "legal.terms.who.p2":
    "如果你未滿 18 歲（依台灣法律為未成年人），請在家長或監護人同意下使用 Trakur，並由家長或監護人代你同意本條款。家長或監護人可以[聯絡我們](/contact)，查看或刪除孩子的資料。",
  "legal.terms.account.title": "你的帳號",
  "legal.terms.account.p1": "你使用 Google 帳號登入。請保護好你的 Google 帳號：登入你的 Trakur 帳號後所做的一切，都會視為你本人的行為。",
  "legal.terms.account.p2": "每個帳號是學生帳號或老師帳號其中之一。請使用你自己的帳號，不要與他人共用，也不要以他人身分登入。",
  "legal.terms.what.title": "Trakur 是什麼、不是什麼",
  "legal.terms.what.p1":
    "Trakur 是整理申請進度、查閱學校資訊的工具。它與任何學校、Common App、加州大學（UC）、Cal State Apply、ApplyTexas、STARS、UCAS 或其他申請系統都沒有關聯，也未獲得它們的背書。",
  "legal.terms.what.data": "<b>學校資料可能有誤或過時。</b>每個數字我們都附上來源連結，但學校會更改截止日期、申請要求與費用。申請前請務必到學校官網確認。",
  "legal.terms.what.estimates": "<b>適配標籤、等級與 GPA 百分位都是估計值</b>，不是預測或承諾。Trakur 上的任何內容都不保證錄取、財務補助或獎學金。",
  "legal.terms.what.reminders": "<b>提醒信可能失敗或延遲</b>（郵件寄送問題、清單上的日期有誤）。準時完成申請是你自己的責任。",
  "legal.terms.what.advice": "Trakur 不提供專業的升學輔導、法律、移民或財務建議。",
  "legal.terms.content.title": "你的內容",
  "legal.terms.content.p1":
    "你輸入的內容（個人檔案、學校清單、成績單、文書、課外活動、筆記）仍屬於你。你只授權我們在提供 Trakur 服務所需的範圍內儲存、複製和顯示這些內容，例如顯示給你連結的老師，或顯示在你建立的分享連結上。",
  "legal.terms.content.p2": "請只輸入你有權分享的資訊。如果你加入他人的資料（例如推薦人的姓名與身分），請先確認對方同意。",
  "legal.terms.portals.title": "申請系統登入資料與 Chrome 擴充功能",
  "legal.terms.portals.p1":
    "在 Trakur 儲存申請系統的登入資料是選擇性的。是否儲存由你決定，風險也由你承擔；儲存方式請見[資料安全](/security)。使用各申請系統時，請遵守該系統自己的規定。",
  "legal.terms.portals.p2":
    "Trakur 擴充功能會用你在 Trakur 的資料，在申請網站上填寫表單（例如課程與成績）。送出前請檢查它填入的所有內容。送出申請的是你，不是 Trakur，申請內容由你負責。",
  "legal.terms.teachers.title": "老師與升學輔導老師",
  "legal.terms.teachers.p1":
    "學生輸入老師的代碼之後，老師才看得到這位學生，而且只看得到[隱私權政策](/privacy#teachers)列出的資訊。老師只能將這些資訊用於輔導自己的學生，必須保密，未經學生同意（未成年學生還需家長同意）不得複製到其他地方。",
  "legal.terms.teachers.p2": "學生隨時可以離開老師，老師隨即失去存取權。",
  "legal.terms.use.title": "使用規範",
  "legal.terms.use.p1": "請不要利用 Trakur：",
  "legal.terms.use.law": "違反法律或侵害他人權利；",
  "legal.terms.use.access": "未經許可進入他人的帳號或資料，或未經許可測試我們的安全防護（發現問題請回報，見[資料安全](/security#report)）；",
  "legal.terms.use.abuse": "讓網站、資料庫或 AI 連接器過載、大量抓取資料或干擾其運作；",
  "legal.terms.use.content": "上傳惡意程式，或違法、仇恨、騷擾性的內容；",
  "legal.terms.use.impersonate": "冒充他人，包括冒充老師或學校。",
  "legal.terms.use.p2": "違反這些規範的帳號，我們可能暫停或關閉，並會告訴你原因，除非法律或他人安全不允許。",
  "legal.terms.plans.title": "方案與付款",
  "legal.terms.plans.p1": "Trakur 有兩種方案（見[方案價格](/pricing)）：",
  "legal.terms.plans.free": "<b>免費方案：</b>學校清單最多 5 所，以及基本版的「複製給 AI」摘要。",
  "legal.terms.plans.pass":
    "<b>入學年度方案：</b>新台幣 990 元，一次付清。這不是訂閱，也不會自動續訂。內容包含不限數量的學校清單、完整的「複製給 AI」內容、連接 AI，以及大學申請填寫工具（Chrome 擴充功能）。",
  "legal.terms.plans.validity":
    "你要選擇自己入學的年度，例如 2027 年秋季入學。方案從生效日起，用到該入學年度的 7 月 31 日為止（台灣時間，含當天）。生效日是你付款的當天；如果買得比較早，則是入學年度前一年的 1 月 1 日。在這個日期之前付款屬於預購：款項現在付清，方案到生效日才開始，在那之前你仍是免費方案，除非你另有一個方案正在生效。方案到期日一到就結束，即使你之後還在申請也一樣。到期後帳號會自動回到免費方案：不會刪除任何資料，但付費功能會停止，學校清單超過免費上限時也無法再新增學校。",
  "legal.terms.plans.activation":
    "ECPay 確認你的付款後，方案會立即開通（預購則從生效日開始）。你在結帳時勾選同意方塊，即表示同意立即開通。因為這是依你的要求立即開始的數位服務，依《通訊交易解除權合理例外情事適用準則》，不適用通訊交易的七天解除權。",
  "legal.terms.plans.refund":
    "除此之外，付款後 7 天內提出申請，我們全額退款。請透過[聯絡我們](/contact)來信，並附上你登入用的電子郵件與付款日期。我們會透過 ECPay 退還全額款項，款項多久會回到你手上，取決於 ECPay 以及你的銀行或發卡機構。若是家長代付，款項會退回家長的付款方式。已退款的方案隨即終止。若同一個入學年度不慎重複付款，我們會退還多出的那一筆。",
  "legal.terms.plans.processor":
    "付款由綠界科技（ECPay）處理。你在 ECPay 自己的頁面以信用卡、ATM 轉帳或超商付款，你的卡號不會經過 Trakur。家長或其他人可以透過你傳給他們的付款連結代為付款，不需要註冊帳號，付款完成後方案會加到你的帳號。我們保存哪些付款紀錄，請見隱私權政策的[保存期間](/privacy#retention)。",
  "legal.terms.others.title": "其他服務",
  "legal.terms.others.p1":
    "Trakur 使用其他公司的服務：Google（登入與 Google 文件）、Supabase（資料庫與帳號）、Vercel（網站主機）、Resend（電子郵件）與綠界科技 ECPay（付款）。如果你連接 ChatGPT 或 Claude 等 AI 應用程式，或把 Trakur 的資料貼到其中，該應用程式如何處理你的資料，適用它自己的條款與隱私權政策。",
  "legal.terms.changes.title": "服務變更、中斷與離開",
  "legal.terms.changes.p1": "Trakur 是仍在開發中的小型服務。功能可能變更或移除，網站有時也可能無法使用。移除你依賴的功能前，我們會盡量事先通知。",
  "legal.terms.changes.p2": "你隨時可以停止使用 Trakur。如要關閉帳號並刪除資料，請見[你的權利與選擇](/privacy#rights)。",
  "legal.terms.liability.title": "免責聲明與責任限制",
  "legal.terms.liability.p1":
    "Trakur 依「現狀」提供。在台灣法律允許的範圍內，我們不對間接或衍生的損失負責，例如錯過截止日期、錄取或財務補助的結果，或你未另行保存的資料遺失。",
  "legal.terms.liability.p2": "本條款不限制你依台灣《消費者保護法》或其他不得事先排除的法律所享有的權利，也不排除我們因故意或重大過失應負的責任。",
  "legal.terms.law.title": "準據法",
  "legal.terms.law.p1": "本條款以中華民國（台灣）法律為準據法。除法律另有規定外，因本條款所生的爭議，以臺灣臺北地方法院為第一審管轄法院。",
  "legal.terms.updates.title": "條款的修改",
  "legal.terms.updates.p1": "我們可能修改本條款，頁首日期即為目前版本。重大修改生效前，我們會在網站上公告。公告後你繼續使用 Trakur，即適用新條款。",
  "legal.terms.contact.title": "聯絡方式",
  "legal.terms.contact.p1": "對本條款有疑問，請見[聯絡我們](/contact)。",
};
