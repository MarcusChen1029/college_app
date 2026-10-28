// Visible (translated) label for each Common App activity type. The stored value is the portal's English label;
// activities.test.ts checks every CA_ACTIVITY_TYPES entry has a key here and in both dictionaries.
import type { MessageKey, TFunction } from "./index.ts";

export const CA_TYPE_KEYS: Record<string, MessageKey> = {
  Academic: "writing.caType.academic",
  Art: "writing.caType.art",
  "Athletics (other)": "writing.caType.athleticsOther",
  "Athletics (JV or varsity)": "writing.caType.athleticsVarsity",
  "Career readiness or practicums": "writing.caType.careerReadiness",
  "Community service or volunteer work": "writing.caType.communityService",
  "Computer or technology": "writing.caType.computerTech",
  Cultural: "writing.caType.cultural",
  Dance: "writing.caType.dance",
  "Debate or speech": "writing.caType.debateSpeech",
  "Employment or work (paid)": "writing.caType.employment",
  Environmental: "writing.caType.environmental",
  "Family responsibilities": "writing.caType.familyResponsibilities",
  "Foreign language": "writing.caType.foreignLanguage",
  Hobby: "writing.caType.hobby",
  Internship: "writing.caType.internship",
  "Journalism or publishing": "writing.caType.journalism",
  "LGBT+": "writing.caType.lgbt",
  Music: "writing.caType.music",
  Religious: "writing.caType.religious",
  Research: "writing.caType.research",
  Robotics: "writing.caType.robotics",
  "R.O.T.C. or military": "writing.caType.rotc",
  "School spirit": "writing.caType.schoolSpirit",
  "Science or math": "writing.caType.scienceMath",
  "Social justice or organizing": "writing.caType.socialJustice",
  "Student government or politics": "writing.caType.studentGovt",
  "Study abroad or foreign exchange": "writing.caType.studyAbroad",
  "Theater or drama": "writing.caType.theater",
  Other: "writing.caType.other",
};

export const caTypeLabel = (t: TFunction, type: string): string => {
  const key = CA_TYPE_KEYS[type];
  return key ? t(key) : type;
};
