import type { Translation } from "../core.ts";

// Official outcomes from the US Department of Education College Scorecard: the college page section ("Graduation &
// earnings", components/CollegeOutcomes.tsx) and the earnings line on /tools/match (outcomes.match.*).
// Measures are named in plain words; the exact Scorecard names live in lib/data/outcomes.json ("measures").
export const en = {
  "outcomes.title": "Graduation & earnings",
  "outcomes.grad.label": "Graduation rate",
  "outcomes.grad.sub": "finished within 6 years (students who started {years})",
  "outcomes.e10.label": "Earnings 10 years after starting",
  "outcomes.e10.sub": "median per year (students who started {years})",
  "outcomes.e6.label": "Earnings 6 years after starting",
  "outcomes.e6.sub": "median per year (students who started {years})",
  "outcomes.missing": "Not published",
  "outcomes.missingSub": "Too few students, or not reported",
  "outcomes.none": "College Scorecard has not published graduation or earnings figures for this college.",
  "outcomes.caveat":
    "Earnings come from US tax records and cover only students who received federal student aid and were working, not studying. International students generally cannot get federal aid, so their results may differ.",
  "outcomes.unitNote": "Earnings are per year, in 2024 dollars, rounded to the nearest $1,000. The graduation rate counts first-time, full-time students.",
  "outcomes.source": "Source: U.S. Department of Education, College Scorecard, data released {date}.",
  "outcomes.view": "See this college on College Scorecard ↗",
  "outcomes.match.earnings": "Median earnings {amount} 5 years after graduating",
  "outcomes.match.earningsFew": "Median earnings {amount} 5 years after graduating (few graduates)",
  "outcomes.match.note":
    "Earnings: U.S. Department of Education, College Scorecard, data released {date}. They cover bachelor's graduates who received federal student aid and were working, not studying; where a college has several programs in the field, the figure averages their medians. International students generally cannot get federal aid, so results may differ. Not shown when Scorecard has too few graduates.",
} as const;

export const zhTW: Translation<typeof en> = {
  "outcomes.title": "畢業率與收入",
  "outcomes.grad.label": "畢業率",
  "outcomes.grad.sub": "在 6 年內畢業（{years} 年入學的學生）",
  "outcomes.e10.label": "入學後 10 年的收入",
  "outcomes.e10.sub": "每年中位數（{years} 年入學的學生）",
  "outcomes.e6.label": "入學後 6 年的收入",
  "outcomes.e6.sub": "每年中位數（{years} 年入學的學生）",
  "outcomes.missing": "未公布",
  "outcomes.missingSub": "學生人數太少，或未回報",
  "outcomes.none": "College Scorecard 沒有公布這所學校的畢業率與收入資料。",
  "outcomes.caveat": "收入來自美國稅務紀錄，只包含領取美國聯邦學生補助、且當時在工作而非就學的學生。國際生通常無法申請聯邦補助，所以國際生的實際結果可能不同。",
  "outcomes.unitNote": "收入為每年金額，以 2024 年美元計，四捨五入到千位。畢業率只計算首次入學的全職學生。",
  "outcomes.source": "資料來源：美國教育部 College Scorecard，資料發布日 {date}。",
  "outcomes.view": "在 College Scorecard 查看這所學校 ↗",
  "outcomes.match.earnings": "畢業後 5 年收入中位數 {amount}",
  "outcomes.match.earningsFew": "畢業後 5 年收入中位數 {amount}（畢業生人數少）",
  "outcomes.match.note":
    "收入資料：美國教育部 College Scorecard，資料發布日 {date}。只包含領取聯邦學生補助、且當時在工作而非就學的學士畢業生；學校在該領域有多個科系時，顯示各科系中位數的平均。國際生通常無法領取聯邦補助，實際結果可能不同。Scorecard 的畢業生人數太少時不顯示。",
};
