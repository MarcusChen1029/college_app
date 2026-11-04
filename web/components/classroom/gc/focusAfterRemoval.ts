/**
 * After an action removed the row (or card) its menu sat in, focus the menu of the row that took its place (or the
 * last one), or the element with `fallbackId` (a heading with tabIndex -1) when nothing is left, instead of letting focus
 * fall back to the page. `listId` is the id of the list holding the rows; ids with a colon (React's useId) do not work here.
 */
export function focusAfterRemoval(listId: string, index: number, fallbackId: string) {
  setTimeout(() => {
    const menus = document.querySelectorAll<HTMLButtonElement>(`#${listId} button[aria-haspopup="menu"]`);
    (menus[Math.min(index, menus.length - 1)] ?? document.getElementById(fallbackId))?.focus();
  }, 0);
}
