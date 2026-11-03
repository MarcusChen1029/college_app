import type { Anchor } from "@/lib/anchors";

/** One choice in the "About" list of a new conversation: the item and the name to show for it (and to save with the conversation). */
export type AnchorOption = { anchor: Anchor; label: string };
