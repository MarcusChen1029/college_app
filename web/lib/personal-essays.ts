// Essays shared across colleges: the Common App personal statement (one essay, one of seven prompts)
// and the UC personal insight questions (answer 4 of 8). Stored on the profile (student_profiles.essays).
// Prompt wording: commonapp.org/apply/essay-prompts (unchanged for 2026-27) and
// admission.universityofcalifornia.edu → Personal insight questions.

import type { EssayStatus } from "./checklist.ts";

export type EssayDoc = { status: EssayStatus; url: string };
export type PersonalEssays = {
  ps?: Partial<EssayDoc> & { prompt?: number | null };
  uc?: { picks?: number[]; docs?: Record<string, Partial<EssayDoc>> };
};

export const PS_WORDS = "250–650 words";
export const PS_PROMPTS: { id: number; text: string }[] = [
  {
    id: 1,
    text: "Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.",
  },
  {
    id: 2,
    text: "The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?",
  },
  { id: 3, text: "Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?" },
  {
    id: 4,
    text: "Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?",
  },
  {
    id: 5,
    text: "Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.",
  },
  {
    id: 6,
    text: "Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?",
  },
  { id: 7, text: "Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design." },
];

export const UC_PICKS = 4;
export const UC_WORDS = "350 words each";
export const UC_PIQS: { id: number; title: string; text: string }[] = [
  {
    id: 1,
    title: "Leadership",
    text: "Describe an example of your leadership experience in which you have positively influenced others, helped resolve disputes or contributed to group efforts over time.",
  },
  {
    id: 2,
    title: "Creativity",
    text: "Every person has a creative side, and it can be expressed in many ways: problem solving, original and innovative thinking, and artistically, to name a few. Describe how you express your creative side.",
  },
  { id: 3, title: "Greatest talent or skill", text: "What would you say is your greatest talent or skill? How have you developed and demonstrated that talent over time?" },
  {
    id: 4,
    title: "Educational opportunity or barrier",
    text: "Describe how you have taken advantage of a significant educational opportunity or worked to overcome an educational barrier you have faced.",
  },
  {
    id: 5,
    title: "Significant challenge",
    text: "Describe the most significant challenge you have faced and the steps you have taken to overcome this challenge. How has this challenge affected your academic achievement?",
  },
  {
    id: 6,
    title: "Inspiring academic subject",
    text: "Think about an academic subject that inspires you. Describe how you have furthered this interest inside and/or outside of the classroom.",
  },
  { id: 7, title: "Improving your school or community", text: "What have you done to make your school or your community a better place?" },
  {
    id: 8,
    title: "Strength as a candidate",
    text: "Beyond what has already been shared in your application, what do you believe makes you a strong candidate for admission to the University of California?",
  },
];

/** Which shared essays apply, from the application platforms of the listed US colleges (application_requirements.platforms). */
export function sharedEssaysFor(platformLists: readonly (readonly string[] | undefined)[]) {
  const has = (p: string) => platformLists.some((l) => l?.includes(p));
  return { commonApp: has("common_app"), uc: has("uc_app") };
}

/** Adds or removes a UC question from the picks. Returns null when it would be a fifth. */
export function togglePick(picks: readonly number[], id: number): number[] | null {
  if (picks.includes(id)) return picks.filter((x) => x !== id);
  return picks.length >= UC_PICKS ? null : [...picks, id].sort((a, b) => a - b);
}
