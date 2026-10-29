// The sample résumé /tools/resume shows while a student has no activities yet, labelled "Sample" on the page and never
// printed or copied. A made-up student at a made-up school, written the way buildResume (lib/resume.ts) lays out real
// entries, so the student sees what their own page will look like. English, like the résumés the builder makes.
import { buildResume, DEFAULT_OPTIONS, SECTION_TITLES, type Resume, type ResumeHeader } from "@/lib/resume";

export const SAMPLE_HEADER: ResumeHeader = {
  fullName: "Alex Lin",
  email: "",
  phone: "+886 912 345 678",
  location: "Taipei, Taiwan",
  school: "Riverside International School",
  gradYear: "2027",
};

// The sample's GPA and test lines come from buildResume itself, so they follow the same rule as a real résumé (GPA on
// its own line, the scores together on the next).
const SAMPLE_SCORES = buildResume({ gpa: 3.8, sat: 1450, tests: { english: { toefl: { total: 108, sections: {} } } } }, SAMPLE_HEADER, DEFAULT_OPTIONS).education.lines;

export const SAMPLE_RESUME: Resume = {
  education: { school: SAMPLE_HEADER.school, gradYear: SAMPLE_HEADER.gradYear, lines: SAMPLE_SCORES },
  sections: [
    {
      key: "honors",
      title: SECTION_TITLES.honors,
      items: [{ title: "Honor Roll", organization: "Riverside International School", meta: "Grades 10–11", description: "Four terms with a term GPA of 3.7 or higher." }],
    },
    {
      key: "leadership",
      title: SECTION_TITLES.leadership,
      items: [
        {
          title: "Captain",
          organization: "Debate Club",
          meta: "Grades 10–12 · 6 hr/wk, 30 wk/yr",
          description: "Led a 20-member team, coached new members on research and rebuttal, and placed third at a regional tournament.",
        },
        { title: "Founder", organization: "Coding Club", meta: "Grades 11–12 · 3 hr/wk, 28 wk/yr", description: "Started weekly workshops on Python and the web for 15 students." },
      ],
    },
    {
      key: "service",
      title: SECTION_TITLES.service,
      items: [{ title: "Volunteer tutor", organization: "Neighbourhood library", meta: "Grades 9–12 · 2 hr/wk, 40 wk/yr", description: "Tutored middle-school students in math and English reading." }],
    },
    {
      key: "work",
      title: SECTION_TITLES.work,
      items: [{ title: "Summer intern", organization: "Design studio", meta: "Summer 2025 · 20 hr/wk, 8 wk", description: "Prepared client presentations and organized the studio's photo archive." }],
    },
  ],
};
