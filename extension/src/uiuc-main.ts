// MAIN-world content script on https://myillini.illinois.edu/* (manifest "world": "MAIN"): the dormant alert/confirm hook that the UIUC
// filler switches on only while it adds courses (uiuc/dialogs.ts). It does nothing until then.

import { installDialogHook } from "./uiuc/dialogs.ts";

installDialogHook(window);
