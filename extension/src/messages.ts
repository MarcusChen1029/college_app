import type { TranscriptResult } from "./auth.ts";

/** Panel -> background requests. Extended by later tasks (fill plan, page state). */
export type PanelRequest = { type: "signIn" } | { type: "signOut" } | { type: "loadTranscript" };

/** Background -> panel responses, keyed by request type. */
export type PanelResponse = { type: "signIn"; ok: boolean } | { type: "signOut" } | { type: "loadTranscript"; result: TranscriptResult };

/** Messages between background and content script (added by Tasks 7-8). */
export type ContentMessage = never;

export type ExtensionMessage = PanelRequest | ContentMessage;
