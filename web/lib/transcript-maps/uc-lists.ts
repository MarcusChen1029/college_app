// The UC application's own dropdown lists, read on a live throwaway UC account (2026-10-27; school outside the US, grading system
// "0-100 (Taiwan)", Semester). Exact option text; `value` is UC's own code where two options share a text. Page facts:
// docs/superpowers/research/2026-10-27-portal-dom.md §3.

/** "Subject Area/Course Category" on the Enter courses & grades page, by A-G area (the select's optgroups). */
export const UC_DISCIPLINES: readonly { area: string; text: string; value: string }[] = [
  { area: "History/Social Science", text: "Civics/American Government", value: "3" },
  { area: "History/Social Science", text: "U.S. History", value: "2" },
  { area: "History/Social Science", text: "World History/Cultures/Hist. Geography", value: "1" },
  { area: "English", text: "English", value: "4" },
  { area: "English", text: "English-ESL/ELD", value: "5" },
  { area: "Mathematics", text: "Algebra I", value: "6" },
  { area: "Mathematics", text: "Geometry", value: "7" },
  { area: "Mathematics", text: "Algebra II", value: "8" },
  { area: "Mathematics", text: "Mathematics I (Integrated)", value: "10" },
  { area: "Mathematics", text: "Mathematics II (Integrated)", value: "11" },
  { area: "Mathematics", text: "Mathematics III (Integrated)", value: "12" },
  { area: "Mathematics", text: "Algebra II/Trigonometry", value: "9" },
  { area: "Mathematics", text: "Statistics", value: "15" },
  { area: "Mathematics", text: "Pre-Calculus", value: "52" },
  { area: "Mathematics", text: "Calculus", value: "14" },
  { area: "Mathematics", text: "Additional Math", value: "56" },
  { area: "Mathematics", text: "Other Advanced Mathematics", value: "13" },
  { area: "Mathematics", text: "Computer Science", value: "16" },
  { area: "Science", text: "Biology/Life Sciences", value: "17" },
  { area: "Science", text: "Biology/Earth & Space Sciences", value: "43" },
  { area: "Science", text: "Chemistry", value: "18" },
  { area: "Science", text: "Chemistry/Earth & Space Sciences", value: "44" },
  { area: "Science", text: "Physics", value: "19" },
  { area: "Science", text: "Physics/Earth & Space Sciences", value: "45" },
  { area: "Science", text: "Integrated Science 1", value: "46" },
  { area: "Science", text: "Integrated Science 2", value: "47" },
  { area: "Science", text: "Integrated Science 3", value: "48" },
  { area: "Science", text: "Applied Science", value: "49" },
  { area: "Science", text: "Computer Science", value: "50" },
  { area: "Science", text: "Earth and Space Sciences", value: "22" },
  { area: "Science", text: "Engineering", value: "51" },
  { area: "Science", text: "Interdisciplinary Sciences", value: "20" },
  { area: "Language Other Than English", text: "Yr 1 Lang Other Than English", value: "23" },
  { area: "Language Other Than English", text: "Yr 2 Lang Other Than English", value: "24" },
  { area: "Language Other Than English", text: "Yr 3 Lang Other Than English", value: "25" },
  { area: "Language Other Than English", text: "Yr 4+ Lang Other Than English", value: "26" },
  { area: "Visual and Performing Arts", text: "Dance", value: "27" },
  { area: "Visual and Performing Arts", text: "Music", value: "28" },
  { area: "Visual and Performing Arts", text: "Theater", value: "29" },
  { area: "Visual and Performing Arts", text: "Visual Arts", value: "30" },
  { area: "Visual and Performing Arts", text: "Interdisciplinary Arts", value: "31" },
  { area: "College-Prep Electives", text: "Elective -English", value: "33" },
  { area: "College-Prep Electives", text: "Elective -English - ESL/ELD", value: "34" },
  { area: "College-Prep Electives", text: "Elective -History/Social Science", value: "32" },
  { area: "College-Prep Electives", text: "Elective -Interdisciplinary", value: "41" },
  { area: "College-Prep Electives", text: "Elective -Language Other Than English", value: "39" },
  { area: "College-Prep Electives", text: "Elective -Mathematics", value: "35" },
  { area: "College-Prep Electives", text: "Elective -Math -Computer Science", value: "42" },
  { area: "College-Prep Electives", text: "Elective -Science-Biology/Life Sciences", value: "36" },
  { area: "College-Prep Electives", text: "Elective -Science-Integrated Science", value: "38" },
  { area: "College-Prep Electives", text: "Elective -Science-Physical Sciences", value: "37" },
  { area: "College-Prep Electives", text: "Elective -Visual & Performing Arts", value: "40" },
];

/** Each option's unique label: its text, or "Computer Science (Mathematics)" / "Computer Science (Science)" where two share a text. */
export function ucDisciplineLabels(): string[] {
  return UC_DISCIPLINES.map((d) => (UC_DISCIPLINES.filter((x) => x.text === d.text).length > 1 ? `${d.text} (${d.area})` : d.text));
}

/** "Honor Type". */
export const UC_HONORS = ["HL", "IB", "NH", "AP"] as const;

/** Language for a Language Other Than English course (`subject_language_code`). */
export const UC_LANGUAGES = [
  "American Sign Language", "Arabic", "Armenian", "Chinese", "Farsi", "Filipino", "French", "German", "Greek", "Hebrew", "Hindi", "Hmong", "Italian",
  "Japanese", "Khmer", "Korean", "Latin", "Other Language", "Portuguese", "Punjabi", "Russian", "Spanish", "Tamil", "Turkish", "Vietnamese",
] as const;

/** School grading systems (High school information page, "select all that apply"). */
export const UC_GRADING_SYSTEMS = [
  "A B C D F", "0-100 (U.S.)", "0-100 (Canada - AB, SK)", "0-100 (Canada - BC)", "0-100 (Canada - MB, NB, ON)", "0-100 (Canada - NL, NS)",
  "0-100 (Canada - PE)", "0-100 (Canada - QC)", "0-100 (Canada - YT)", "0-100 (China)", "0-100 (India)", "0-100 (Korea)", "0-100 (Mexico)",
  "0-100 (Pakistan)", "0-100 (Philippines)", "0-100 (Saudi Arabia)", "0-100 (Taiwan)", "0-100 (Turkey)", "0-100 (United Arab Emirates)",
  "0-15 (Germany)", "0-20 (France)", "0.0-4.0 (United Arab Emirates)", "1-10 (Mexico)", "1-5 (Turkey)", "1-7 Int'l Bacc", "1-9 (U.K.)",
  "A*-E, U (U.K.)", "Sehr Gut, Gut... (Germany)", "Su, Wu, Mi... (Korea)", "Other",
] as const;

/** School term systems (same page). The number of grade boxes per course follows it. */
export const UC_TERM_SYSTEMS = {
  full_year: "Full year (1 final grade per year)",
  semester: "Semester (2 final grades per year)",
  trimester: "Trimester (3 final grades per year)",
  quarter: "Quarter (4 final grades per year)",
} as const;

/** Grade codes besides the scale's own grades: NO in every year; IP and PL also in 12th grade (seen live). */
export const UC_GRADE_CODES = { notTaken: "NO", inProgress: "IP", planned: "PL" } as const;
