// Every message section, in one place. Keys are prefixed with the section name so they never collide (i18n.test.ts checks).
import * as application from "./messages/application.ts";
import * as college from "./messages/college.ts";
import * as colleges from "./messages/colleges.ts";
import * as common from "./messages/common.ts";
import * as extension from "./messages/extension.ts";
import * as home from "./messages/home.ts";
import * as legal from "./messages/legal.ts";
import * as match from "./messages/match.ts";
import * as misc from "./messages/misc.ts";
import * as outcomes from "./messages/outcomes.ts";
import * as portals from "./messages/portals.ts";
import * as privacy from "./messages/privacy.ts";
import * as profile from "./messages/profile.ts";
import * as quiz from "./messages/quiz.ts";
import * as recommenders from "./messages/recommenders.ts";
import * as scholarships from "./messages/scholarships.ts";
import * as security from "./messages/security.ts";
import * as settings from "./messages/settings.ts";
import * as share from "./messages/share.ts";
import * as status from "./messages/status.ts";
import * as supplements from "./messages/supplements.ts";
import * as teacher from "./messages/teacher.ts";
import * as tools from "./messages/tools.ts";
import * as transcript from "./messages/transcript.ts";
import * as writing from "./messages/writing.ts";

export const SECTIONS = {
  application,
  college,
  colleges,
  common,
  extension,
  home,
  legal,
  match,
  misc,
  outcomes,
  portals,
  privacy,
  profile,
  quiz,
  recommenders,
  scholarships,
  security,
  settings,
  share,
  status,
  supplements,
  teacher,
  tools,
  transcript,
  writing,
} as const;
