// STARS's own dropdown lists, read from a live STARS record (throwaway test account, 2026-10-27) on the coursework page for a school
// outside the US ("EnterInternationalCoursework"). Exact option text, in STARS's order. The US-school coursework page was not seen;
// its subject list (from STARS's help center) is in stars.ts.

import type { GradeScale, Level, Subject } from "../transcript.ts";

/** "Courses/Exams Were Taken in". */
export const STARS_INTL_ACADEMIC_LEVELS = [
  "Equivalent to U.S. High School 9th Grade",
  "Equivalent to U.S. High School 10th Grade",
  "Equivalent to U.S. High School 11th Grade",
  "Equivalent to U.S. High School 12th Grade",
  "Equivalent to U.S. High School 13th Grade",
] as const;

export const STARS_INTL_SUBJECTS = [
  "Mathematics", "Science", "History / Social Studies", "Languages", "Computer Science / Info Tech", "Business", "Fine Arts / Music",
  "Phys. Ed / Health / Gym", "Other Subject Area",
] as const;
export type StarsIntlSubject = (typeof STARS_INTL_SUBJECTS)[number];

/** "Proficiency Level". */
export const STARS_INTL_LEVELS = [
  "AP (Advanced Placement)", "Advanced", "Basic", "Dual Enrollment", "GCE Advanced Level", "GCE Advanced Subsidiary Level", "General", "Honors",
  "IB (Higher/HL)", "IB (Standard/SL)", "IGCSE/GCSE Ordinary Level", "In-Class/Internal Grade", "Middle Years IB", "Not Applicable", "Predicted Score",
  "Standard",
] as const;

/** "Course Length / External Exam". Semester, Trimester and Quarterly show one grade box (and one credit box) per term; Full Year shows one. */
export const STARS_INTL_LENGTHS = ["External Exam", "Full Year", "Semester", "Trimester", "Quarterly", "Quintile"] as const;

/** "Grading Scale (with estimated U.S. letter grade equivalent)". There is no letter-grade scale on this page. */
export const STARS_INTL_SCALES = [
  "IGCSE Ordinary (O-Level, 9,A*=A+, 7-8=A,6=B...Pass=4,C)",
  "IB--Int'l Bac 7-point (7=A  6=A-  5=B...)",
  "GCE & Int'l Advanced Subsidiary (AS-Level)",
  "GCE & Int'l Advanced (A-Level)",
  "French Baccalauréat (20-16=A...Pass=8)",
  "100-Point (100-90=A, 80-89=B...Pass=70)",
  "100-Point (100-90=A, 80-89=B...Pass=60)",
  "10-Point (10=A+, 9=A, 8=B...Pass=6)",
  "5-Point (5=A, 4=B,...Pass=3)",
  "5-Point (5=A, 4=B,...Pass=2)",
  "5-Point (1=A, 2=B,...Pass=4)",
] as const;

/** Grade options besides the numbers 1-200 (100-point scale). "In Progress" comes first in the list. */
export const STARS_INTL_GRADE_WORDS = ["In Progress", "Withdrawn", "Medical Excuse", "No Credit", "Pass/Fail - Pass", "Pass/Fail - Fail", "Incomplete", "No Grade - Not In Progress"] as const;

/** "Course/Exam Content" (the generic course title) for each subject. */
export const STARS_INTL_TITLES: Record<StarsIntlSubject, readonly string[]> = {
  Mathematics: [
    "ALGEBRA 1", "GEOMETRY", "ALGEBRA 2", "TRIGONOMETRY", "PRECALCULUS", "CALCULUS", "STATISTICS", "ADVANCED MATH", "APPLIED MATH", "BUSINESS MATH",
    "CONSUMER MATH", "DIFFERENTIAL EQUATIONS", "DISCRETE MATH", "ELEMENTARY FUNCTIONS", "FINITE MATHEMATICS", "LINEAR ALGEBRA", "LINEAR PROGRAMMING",
    "MATH ANALYSIS", "PRE-ALGEBRA", "INTEGRATED ALGEBRA/GEOMETRY", "INTEGRATED ALGEBRA/GEOMETRY/TRIGONOMETRY", "IB MATH ANALYSIS AND APPROACHES HL",
    "IB MATH ANALYSIS AND APPROACHES SL", "IB MATH APPLICATIONS AND INTERPRETATIONS HL", "IB MATH APPLICATIONS AND INTERPRETATIONS SL", "IB MATH MYP",
    "IB MATH STUDIES", "IB MATHEMATICS", "OTHER MATH", "ALGEBRA 2/TRIGONOMETRY", "ALGEBRA 3/TRIGONOMETRY", "COLLEGE ALGEBRA", "COLLEGE ALGEBRA/TRIGONOMETRY",
    "COLLEGE MATH", "TRIGONOMETRY/PRE-CALCULUS",
  ],
  Science: [
    "BIOLOGY", "CHEMISTRY", "PHYSICS", "ENVIRONMENTAL SCIENCE", "EARTH SCIENCE", "ANATOMY & PHYSIOLOGY", "PHYSICAL SCIENCE", "AEROSPACE", "ANATOMY",
    "ASTRONOMY", "BOTANY", "ECOLOGY", "ELECTRICITY AND MAGNETISM", "FORENSIC SCIENCE", "GENETICS", "GEOLOGY", "INTEGRATED SCIENCE", "INTRO TO ENGINEERING",
    "INTRO TO SCIENCE", "LIFE SCIENCE", "MARINE SCIENCE/BIOLOGY", "METEOROLOGY", "MICROBIOLOGY", "NUTRITION/FOOD SCIENCE", "OCEANOGRAPHY", "ORGANIC CHEMISTRY",
    "PHYSIOLOGY", "PRINCIPLES OF ENGINEERING", "SCIENCE, TECH, & SOCIETY", "ZOOLOGY", "OTHER SCIENCE",
  ],
  "History / Social Studies": [
    "AMERICAN/US HISTORY", "CIVICS", "ECONOMICS", "GEOGRAPHY", "GOVERNMENT AND POLITICS", "PSYCHOLOGY", "SOCIOLOGY", "US GOVERNMENT", "WORLD HISTORY",
    "AFRICAN AMERICAN STUDIES/HISTORY", "ANCIENT & MEDIEVAL HISTORY", "ANCIENT CIVILIZATIONS", "ANTHROPOLOGY", "COMPARATIVE GOVT/POLITICS",
    "CONTEMPORARY WORLD ISSUES", "ETHNIC STUDIES", "EUROPEAN HISTORY", "GENDER STUDIES", "GLOBAL STUDIES", "HUMANITIES", "INTERNATIONAL RELATIONS",
    "LAW STUDIES", "MACROECONOMICS", "MICROECONOMICS", "PHILOSOPHY", "POLITICAL SCIENCE", "SOCIAL STUDIES", "SOCIOLOGY 2", "US & WORLD AFFAIRS",
    "WESTERN CIVILIZATION", "WORLD CIVILIZATIONS", "WORLD CULTURES", "WORLD RELIGIONS", "OTHER HISTORY/SOCIAL STUDIES",
  ],
  Languages: [
    "ENGLISH 9 (FIRST YEAR)", "SPANISH 1 (FIRST YEAR)", "SPANISH 2 (SECOND YEAR)", "SPANISH 3 (THIRD YEAR)", "SPANISH 4 (FOURTH YEAR)", "SPANISH 5 (FIFTH YEAR)",
    "SPANISH 6 (SIXTH YEAR)", "SPANISH FOR NATIVE SPEAKERS", "SPANISH LANGUAGE & CULTURE", "SPANISH LANGUAGE & LITERATURE", "SPANISH LITERATURE",
    "SPANISH LITERATURE & CULTURE", "ENGLISH 10 (SECOND YEAR)", "ENGLISH 11 (THIRD YEAR)", "ENGLISH 12 (FOURTH YEAR)", "FRENCH 1 (FIRST YEAR)",
    "FRENCH 2 (SECOND YEAR)", "FRENCH 3 (THIRD YEAR)", "FRENCH 4 (FOURTH YEAR)", "FRENCH 5 (FIFTH YEAR)", "FRENCH 6 (SIXTH YEAR)", "FRENCH LANGUAGE & CULTURE",
    "FRENCH LANGUAGE & LITERATURE", "FRENCH LITERATURE", "ENGLISH LANGUAGE AND COMPOSITION", "ENGLISH LANGUAGE AND LITERATURE", "ENGLISH LITERATURE AND COMPOSITION",
    "LATIN 1 (FIRST YEAR)", "LATIN 2 (SECOND YEAR)", "LATIN 3 (THIRD YEAR)", "LATIN 4 (FOURTH YEAR)", "LATIN 5 (FIFTH YEAR)", "LATIN 6 (SIXTH YEAR)",
    "ENGLISH LITERATURE", "AMERICAN LITERATURE", "BRITISH LITERATURE", "CLASSIC LITERATURE", "COMMUNICATIONS", "CREATIVE WRITING", "ENGLISH COMPOSITION 1",
    "ENGLISH COMPOSITION 2", "ESL 1 (ENGL AS A SECOND LANG 1)", "ESL 2 (ENGL AS A SECOND LANG 2)", "FORENSIC SPEECH-DEBATE", "JOURNALISM", "MYTHOLOGY",
    "PUBLIC SPEAKING", "RESEARCH (ENGLISH)", "SEMINAR", "WORLD LITERATURE", "AMERICAN INDIAN 1 (FIRST YEAR)", "AMERICAN INDIAN 2 (SECOND YEAR)",
    "AMERICAN INDIAN 3 (THIRD YEAR)", "AMERICAN INDIAN 4 (FOURTH YEAR)", "AMERICAN INDIAN 5 (FIFTH YEAR)", "AMERICAN INDIAN 6 (SIXTH YEAR)",
    "AMERICAN INDIAN IMMERSION", "AMERICAN INDIAN LANGUAGE & LITERATURE", "AMERICAN INDIAN LITERATURE", "AMERICAN SIGN LANGUAGE 1 (FIRST YEAR)",
    "AMERICAN SIGN LANGUAGE 2 (SECOND YEAR)", "AMERICAN SIGN LANGUAGE 3 (THIRD YEAR)", "AMERICAN SIGN LANGUAGE 4 (FOURTH YEAR)",
    "AMERICAN SIGN LANGUAGE 5 (FIFTH YEAR)", "AMERICAN SIGN LANGUAGE 6 (SIXTH YEAR)", "ARABIC 1 (FIRST YEAR)", "ARABIC 2 (SECOND YEAR)", "ARABIC 3 (THIRD YEAR)",
    "ARABIC 4 (FOURTH YEAR)", "ARABIC 5 (FIFTH YEAR)", "ARABIC 6 (SIXTH YEAR)", "ARABIC LANGUAGE & LITERATURE", "ARABIC LITERATURE", "BRAILLE",
    "CHINESE 1 (FIRST YEAR)", "CHINESE 2 (SECOND YEAR)", "CHINESE 3 (THIRD YEAR)", "CHINESE 4 (FOURTH YEAR)", "CHINESE 5 (FIFTH YEAR)", "CHINESE 6 (SIXTH YEAR)",
    "CHINESE LANGUAGE & CULTURE", "CHINESE LANGUAGE & LITERATURE", "CHINESE LITERATURE", "CLASSICAL GREEK 1 (FIRST YEAR)", "CLASSICAL GREEK 2 (SECOND YEAR)",
    "CLASSICAL GREEK 3 (THIRD YEAR)", "CLASSICAL GREEK 4 (FOURTH YEAR)", "CLASSICAL GREEK 5 (FIFTH YEAR)", "CLASSICAL GREEK 6 (SIXTH YEAR)",
    "CLASSICAL HEBREW 1 (FIRST YEAR)", "CLASSICAL HEBREW 2 (SECOND YEAR)", "CLASSICAL HEBREW 3 (THIRD YEAR)", "CLASSICAL HEBREW 4 (FOURTH YEAR)",
    "CLASSICAL HEBREW 5 (FIFTH YEAR)", "CLASSICAL HEBREW 6 (SIXTH YEAR)", "FILIPINO 1 (FIRST YEAR)", "FILIPINO 2 (SECOND YEAR)", "FILIPINO 3 (THIRD YEAR)",
    "FILIPINO 4 (FOURTH YEAR)", "FILIPINO 5 (FIFTH YEAR)", "FILIPINO 6 (SIXTH YEAR)", "FILIPINO LANGUAGE & LITERATURE", "FILIPINO LITERATURE",
    "GERMAN 1 (FIRST YEAR)", "GERMAN 2 (SECOND YEAR)", "GERMAN 3 (THIRD YEAR)", "GERMAN 4 (FOURTH YEAR)", "GERMAN 5 (FIFTH YEAR)", "GERMAN 6 (SIXTH YEAR)",
    "GERMAN LANGUAGE & CULTURE", "GERMAN LANGUAGE & LITERATURE", "GERMAN LITERATURE", "GREEK 1 (FIRST YEAR)", "GREEK 2 (SECOND YEAR)", "GREEK 3 (THIRD YEAR)",
    "GREEK 4 (FOURTH YEAR)", "GREEK 5 (FIFTH YEAR)", "GREEK 6 (SIXTH YEAR)", "GREEK LANGUAGE & LITERATURE", "GREEK LITERATURE", "HEBREW 1 (FIRST YEAR)",
    "HEBREW 2 (SECOND YEAR)", "HEBREW 3 (THIRD YEAR)", "HEBREW 4 (FOURTH YEAR)", "HEBREW 5 (FIFTH YEAR)", "HEBREW 6 (SIXTH YEAR)", "HEBREW LANGUAGE & LITERATURE",
    "HEBREW LITERATURE", "HINDI 1 (FIRST YEAR)", "HINDI 2 (SECOND YEAR)", "HINDI 3 (THIRD YEAR)", "HINDI 4 (FOURTH YEAR)", "HINDI 5 (FIFTH YEAR)",
    "HINDI 6 (SIXTH YEAR)", "ITALIAN 1 (FIRST YEAR)", "ITALIAN 2 (SECOND YEAR)", "ITALIAN 3 (THIRD YEAR)", "ITALIAN 4 (FOURTH YEAR)", "ITALIAN 5 (FIFTH YEAR)",
    "ITALIAN 6 (SIXTH YEAR)", "ITALIAN LANGUAGE & CULTURE", "ITALIAN LANGUAGE & LITERATURE", "ITALIAN LITERATURE", "JAPANESE 1 (FIRST YEAR)",
    "JAPANESE 2 (SECOND YEAR)", "JAPANESE 3 (THIRD YEAR)", "JAPANESE 4 (FOURTH YEAR)", "JAPANESE 5 (FIFTH YEAR)", "JAPANESE 6 (SIXTH YEAR)",
    "JAPANESE LANGUAGE & CULTURE", "JAPANESE LANGUAGE & LITERATURE", "JAPANESE LITERATURE", "KOREAN 1 (FIRST YEAR)", "KOREAN 2 (SECOND YEAR)",
    "KOREAN 3 (THIRD YEAR)", "KOREAN 4 (FOURTH YEAR)", "KOREAN 5 (FIFTH YEAR)", "KOREAN 6 (SIXTH YEAR)", "KOREAN LANGUAGE & LITERATURE", "KOREAN LITERATURE",
    "PORTUGUESE 1 (FIRST YEAR)", "PORTUGUESE 2 (SECOND YEAR)", "PORTUGUESE 3 (THIRD YEAR)", "PORTUGUESE 4 (FOURTH YEAR)", "PORTUGUESE 5 (FIFTH YEAR)",
    "PORTUGUESE 6 (SIXTH YEAR)", "PORTUGUESE LANGUAGE & LITERATURE", "PORTUGUESE LITERATURE", "RUSSIAN 1 (FIRST YEAR)", "RUSSIAN 2 (SECOND YEAR)",
    "RUSSIAN 3 (THIRD YEAR)", "RUSSIAN 4 (FOURTH YEAR)", "RUSSIAN 5 (FIFTH YEAR)", "RUSSIAN 6 (SIXTH YEAR)", "RUSSIAN LANGUAGE & LITERATURE", "RUSSIAN LITERATURE",
    "SWAHILI 1 (FIRST YEAR)", "SWAHILI 2 (SECOND YEAR)", "SWAHILI 3 (THIRD YEAR)", "SWAHILI 4 (FOURTH YEAR)", "SWAHILI 5 (FIFTH YEAR)", "SWAHILI 6 (SIXTH YEAR)",
    "SWAHILI LANGUAGE & LITERATURE", "SWAHILI LITERATURE", "URDU 1 (FIRST YEAR)", "URDU 2 (SECOND YEAR)", "URDU 3 (THIRD YEAR)", "URDU 4 (FOURTH YEAR)",
    "URDU 5 (FIFTH YEAR)", "URDU 6 (SIXTH YEAR)", "VIETNAMESE 1 (FIRST YEAR)", "VIETNAMESE 2 (SECOND YEAR)", "VIETNAMESE 3 (THIRD YEAR)",
    "VIETNAMESE 4 (FOURTH YEAR)", "VIETNAMESE 5 (FIFTH YEAR)", "VIETNAMESE 6 (SIXTH YEAR)", "VIETNAMESE LANGUAGE & LITERATURE", "VIETNAMESE LITERATURE",
    "OTHER ENGLISH", "OTHER LANGUAGE",
  ],
  "Computer Science / Info Tech": [
    "COMPUTER APPLICATIONS", "COMPUTER GRAPHICS DESIGN", "COMPUTER KEYBOARDING", "COMPUTER PROGRAMMING", "COMPUTER SCIENCE 1", "COMPUTER SCIENCE 2",
    "INFORMATION TECHNOLOGY", "WEB DESIGN AND DEVELOPMENT", "OTHER COMPUTER SCIENCE",
  ],
  Business: [
    "ACCOUNTING 1", "BUSINESS LAW", "BUSINESS MANAGEMENT", "ENTREPRENEURSHIP", "FINANCE", "INTRO TO BUSINESS", "MARKETING", "ACCOUNTING 2", "ADVERTISING",
    "BANKING", "BANKING AND FINANCE", "COMPUTER BUSINESS APPLICATIONS", "CONSUMER LAW", "HUMAN RESOURCES", "INTERNATIONAL BUSINESS", "INVESTING", "LEGAL SYSTEM",
    "MANAGEMENT", "OTHER BUSINESS", "FINANCIAL LITERACY/PERSONAL FINANCE",
  ],
  "Fine Arts / Music": [
    "ART", "BAND", "CERAMICS", "CHORUS", "MUSIC", "ORCHESTRA", "PHOTOGRAPHY", "THEATRE ARTS", "ACTING/DRAMA", "ART HISTORY", "CERAMICS 2",
    "CREATIVE ART--DRAW-PAINT-ETC", "DANCE", "DRAMA", "GRAPHIC DESIGN", "INSTRUMENTAL MUSIC", "MUSIC APPRECIATION", "MUSIC HISTORY 1", "MUSIC HISTORY 2",
    "MUSIC THEORY 1", "MUSIC THEORY 2", "PHOTOGRAPHY 2", "STUDIO ART", "VIDEO PRODUCTION", "OTHER FINE ART", "OTHER MUSIC",
  ],
  "Phys. Ed / Health / Gym": ["HEALTH EDUCATION", "PHYSICAL EDUCATION", "PHYSICAL EDUCATION AND HEALTH", "VARSITY SPORT", "OTHER PHYSICAL EDUCATION"],
  "Other Subject Area": [
    "ACT/SAT PREPARATION", "CULINARY ARTS", "DRIVERS EDUCATION", "RELIGION", "SEMINAR", "AGRICULTURE", "ARCHITECTURE", "CRIMINAL JUSTICE", "DIGITAL ELECTRONICS",
    "ETHICS/MORALITY", "FAMILY CONSUMER SCIENCE", "FRESHMAN SEMINAR", "INTERNSHIP", "JUNIOR ROTC / ROTC", "RESEARCH", "ROBOTICS", "YEARBOOK", "OTHER",
    "CONSTRUCTION / MANUFACTURING", "HOSPITALITY / TOURISM", "MILITARY SCIENCE", "NATURAL RESOURCES /FORESTRY", "TRANSPORTATION / LOGISTICS",
  ],
};

// ---- Mapping onto the international page's lists (used when the school is outside the US) ----


/** Tracker subject -> international "Subject Area". English and other languages are both "Languages" there (seen live). */
export const STARS_INTL_SUBJECT: Record<Subject, StarsIntlSubject> = {
  english: "Languages",
  mathematics: "Mathematics",
  science: "Science",
  history_social: "History / Social Studies",
  world_language: "Languages",
  arts: "Fine Arts / Music",
  computer_science: "Computer Science / Info Tech",
  business: "Business",
  pe_health: "Phys. Ed / Health / Gym",
  career_technical: "Other Subject Area",
  other: "Other Subject Area",
};

/** Tracker level -> "Proficiency Level"; null where the tracker level has no single match (the student picks it). */
export const STARS_INTL_LEVEL: Record<Level, string | null> = {
  regular: "Standard", accelerated: "Advanced", advanced: "Advanced", honors: "Honors", high_honors: "Honors", ap: "AP (Advanced Placement)",
  ib_hl: "IB (Higher/HL)", ib_sl: "IB (Standard/SL)", ib: null, pre_ib: "Middle Years IB", a_level: null, gcse_igcse: "IGCSE/GCSE Ordinary Level",
  college_prep: "Standard", dual_enrollment: "Dual Enrollment", enriched: "Advanced", gifted: "Advanced", intensive: "Advanced", regents: "Standard",
  other: null, none: "Not Applicable",
};

/** The "OTHER …" generic title of a subject: STARS's own choice when no listed title fits. English courses use "OTHER ENGLISH". */
export function starsIntlOtherTitle(subject: Subject): string {
  if (subject === "english") return "OTHER ENGLISH";
  if (subject === "world_language") return "OTHER LANGUAGE";
  if (subject === "arts") return "OTHER FINE ART";
  return STARS_INTL_TITLES[STARS_INTL_SUBJECT[subject]].find((t) => t.startsWith("OTHER"))!;
}

/** The Grading Scale options that fit a tracker scale. More than one = the student must say which (e.g. the passing mark), never guessed. */
export function starsIntlScalesFor(scale: GradeScale, max: number | null): string[] {
  const s = STARS_INTL_SCALES;
  if (scale === "percent_100") return [s[5], s[6]];
  if (scale === "ib_7") return [s[1]];
  if (scale === "gcse_9_1") return [s[0]];
  if (scale === "a_level") return [s[3], s[2]];
  if (scale === "other" && max === 10) return [s[7]];
  if (scale === "other" && max === 20) return [s[4]];
  if ((scale === "other" || scale === "gpa_decimal") && max === 5) return [s[8], s[9], s[10]];
  return [];
}
