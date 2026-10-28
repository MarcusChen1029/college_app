// myIllini reports Add Course errors with alert(), and A Level types ask with confirm(). Both live in the page's own (MAIN) world, which a
// content script can't reach, and an open alert would freeze a fill silently. So a tiny MAIN-world script (uiuc-main.ts, declared in
// manifest.json for myillini.illinois.edu only) waits dormant; for the duration of a fill only, the content script switches it on, it
// records each alert/confirm text instead of showing it (confirm answers Cancel), and it puts the originals back when switched off.
// The two worlds talk through window events with string details (objects don't cross worlds).
//
// Every event carries a NONCE the content script makes fresh for each fill (switch-on carries it to the hook; reports and switch-off must
// repeat it). A page script that fires these event names blindly, or replays an old fill's events, is ignored. This is not a lock against a
// hostile page: window events are visible to every script in the page, so a script that is already listening when the fill starts can read
// the nonce. It does not need to be one: the hook only swaps the page's own alert/confirm (which the page can do anyway) and the worst a
// forged report does is change a line of report text. (isTrusted cannot tell the worlds apart: script-made events are never trusted.)

export const DIALOG_CONTROL = "college-filler:uiuc-dialogs";
export const DIALOG_REPORT = "college-filler:uiuc-dialog";
/** The hook switches itself off after this long even if no "off" arrives (the panel was closed mid-fill). */
export const DIALOG_HOOK_MAX_MS = 15 * 60 * 1000;

const NONCE_SHAPE = /^[0-9a-f]{32}$/;

/** 128 random bits as 32 hex characters. */
export function newNonce(c: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  return [...c.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A control event's detail: JSON {cmd, nonce}, or null for anything else (including the page's own look-alike events). */
function parseControl(detail: unknown): { cmd: "on" | "off"; nonce: string } | null {
  if (typeof detail !== "string") return null;
  try {
    const x = JSON.parse(detail) as { cmd?: unknown; nonce?: unknown };
    if ((x.cmd === "on" || x.cmd === "off") && typeof x.nonce === "string" && NONCE_SHAPE.test(x.nonce)) return { cmd: x.cmd, nonce: x.nonce };
  } catch {
    // not ours
  }
  return null;
}

type DialogWindow = Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent" | "setTimeout" | "clearTimeout"> & {
  alert: (message?: string) => void;
  confirm: (message?: string) => boolean;
  CustomEvent: typeof CustomEvent;
};

/** MAIN world: installs the dormant hook on the page's window. */
export function installDialogHook(win: DialogWindow): void {
  // Taken now (document_start, before any page script runs), so a page that later replaces them cannot intercept the reports.
  const dispatch = win.dispatchEvent.bind(win);
  const Custom = win.CustomEvent;
  // The page's alert/confirm as they are when a fill starts (the page may have replaced them since it loaded); put back at the end.
  let original: { alert: DialogWindow["alert"]; confirm: DialogWindow["confirm"] } | null = null;
  let timer: number | null = null;
  /** The nonce of the fill that switched the hook on; null while dormant. */
  let nonce: string | null = null;
  const report = (kind: string, message: unknown) => {
    if (nonce) dispatch(new Custom(DIALOG_REPORT, { detail: JSON.stringify({ kind, text: String(message ?? ""), nonce }) }));
  };
  const off = () => {
    if (original) {
      win.alert = original.alert;
      win.confirm = original.confirm;
    }
    original = null;
    nonce = null;
    if (timer) win.clearTimeout(timer);
    timer = null;
  };
  win.addEventListener(DIALOG_CONTROL, (e: Event) => {
    const c = parseControl((e as CustomEvent).detail);
    if (!c) return;
    if (c.cmd === "on") {
      nonce = c.nonce; // a new fill takes over from one that never switched off (its panel was closed)
      if (!original) original = { alert: win.alert, confirm: win.confirm }; // a second "on" must not capture our own hook
      win.alert = (m?: string) => void report("alert", m);
      win.confirm = (m?: string) => {
        report("confirm", m);
        return false; // Cancel: the filler never agrees to anything the page asks
      };
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(off, DIALOG_HOOK_MAX_MS);
    } else if (c.nonce === nonce) off(); // only the fill that switched it on can switch it off
  });
}

/** Content-script side: switch the hook on for a fill, collect what the page said, switch it off. `makeNonce` is for tests. */
export function pageDialogs(
  win: Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent"> & { CustomEvent: typeof CustomEvent },
  makeNonce: () => string = newNonce,
) {
  let got: string[] = [];
  let nonce = "";
  const control = (cmd: "on" | "off") => win.dispatchEvent(new win.CustomEvent(DIALOG_CONTROL, { detail: JSON.stringify({ cmd, nonce }) }));
  const listen = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (typeof d !== "string") return;
    try {
      const x = JSON.parse(d) as { kind?: string; text?: string; nonce?: string };
      if (!nonce || x.nonce !== nonce) return; // not from this fill's hook
      got.push(`${x.kind === "confirm" ? "(asked) " : ""}${x.text ?? ""}`);
    } catch {
      // not ours
    }
  };
  return {
    start() {
      got = [];
      nonce = makeNonce();
      win.addEventListener(DIALOG_REPORT, listen);
      control("on");
    },
    take(): string[] {
      const out = got;
      got = [];
      return out;
    },
    stop() {
      control("off");
      win.removeEventListener(DIALOG_REPORT, listen);
      nonce = "";
    },
  };
}
