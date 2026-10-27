// myIllini reports Add Course errors with alert(), and A Level types ask with confirm(). Both live in the page's own (MAIN) world, which a
// content script can't reach, and an open alert would freeze a fill silently. So a tiny MAIN-world script (uiuc-main.ts, declared in
// manifest.json for myillini.illinois.edu only) waits dormant; for the duration of a fill only, the content script switches it on, it
// records each alert/confirm text instead of showing it (confirm answers Cancel), and it puts the originals back when switched off.
// The two worlds talk through window events with string details (objects don't cross worlds).

export const DIALOG_CONTROL = "college-filler:uiuc-dialogs";
export const DIALOG_REPORT = "college-filler:uiuc-dialog";
/** The hook switches itself off after this long even if no "off" arrives (the panel was closed mid-fill). */
export const DIALOG_HOOK_MAX_MS = 15 * 60 * 1000;

type DialogWindow = Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent" | "setTimeout" | "clearTimeout"> & {
  alert: (message?: string) => void;
  confirm: (message?: string) => boolean;
  CustomEvent: typeof CustomEvent;
};

/** MAIN world: installs the dormant hook on the page's window. */
export function installDialogHook(win: DialogWindow): void {
  // The page's alert/confirm as they are when a fill starts (the page may have replaced them since it loaded); put back at the end.
  let original: { alert: DialogWindow["alert"]; confirm: DialogWindow["confirm"] } | null = null;
  let timer: number | null = null;
  const report = (kind: string, message: unknown) =>
    win.dispatchEvent(new win.CustomEvent(DIALOG_REPORT, { detail: JSON.stringify({ kind, text: String(message ?? "") }) }));
  const off = () => {
    if (original) {
      win.alert = original.alert;
      win.confirm = original.confirm;
    }
    original = null;
    if (timer) win.clearTimeout(timer);
    timer = null;
  };
  win.addEventListener(DIALOG_CONTROL, (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d === "on") {
      if (!original) original = { alert: win.alert, confirm: win.confirm }; // a second "on" must not capture our own hook
      win.alert = (m?: string) => void report("alert", m);
      win.confirm = (m?: string) => {
        report("confirm", m);
        return false; // Cancel: the filler never agrees to anything the page asks
      };
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(off, DIALOG_HOOK_MAX_MS);
    } else if (d === "off") off();
  });
}

/** Content-script side: switch the hook on for a fill, collect what the page said, switch it off. */
export function pageDialogs(win: Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent"> & { CustomEvent: typeof CustomEvent }) {
  let got: string[] = [];
  const listen = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (typeof d !== "string") return;
    try {
      const x = JSON.parse(d) as { kind?: string; text?: string };
      got.push(`${x.kind === "confirm" ? "(asked) " : ""}${x.text ?? ""}`);
    } catch {
      // not ours
    }
  };
  return {
    start() {
      got = [];
      win.addEventListener(DIALOG_REPORT, listen);
      win.dispatchEvent(new win.CustomEvent(DIALOG_CONTROL, { detail: "on" }));
    },
    take(): string[] {
      const out = got;
      got = [];
      return out;
    },
    stop() {
      win.dispatchEvent(new win.CustomEvent(DIALOG_CONTROL, { detail: "off" }));
      win.removeEventListener(DIALOG_REPORT, listen);
    },
  };
}
