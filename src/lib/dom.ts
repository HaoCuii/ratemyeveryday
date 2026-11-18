/** Typed getElementById that fails loudly if the markup is missing an id. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

type Child = Node | string | null | undefined | false;

/** Tiny element builder: h("button", { class: "…", type: "button" }, "Label"). Text is always set as text, never HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function avatar(url: string | null | undefined, cls = "size-[22px] shrink-0") {
  const img = h("img", { alt: "", class: cls, referrerpolicy: "no-referrer" });
  if (url) img.src = url;
  else img.hidden = true;
  return img;
}
