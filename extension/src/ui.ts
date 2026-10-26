// Tiny DOM builders for the side panel. All text goes in with textContent / append (never innerHTML): course names and portal messages
// are data, not markup.

export type Child = Node | string | null | false;

export function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

export function button(label: string, onClick: () => void, cls = "btn", disabled = false): HTMLButtonElement {
  const b = h("button", { type: "button", class: cls }, label) as HTMLButtonElement;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}
