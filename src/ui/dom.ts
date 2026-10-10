// Small element builder so the UI never assembles HTML from strings.

type Child = Node | string | null | undefined | false;
type Attr = string | boolean | ((event: Event) => void);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, Attr> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === 'function') el.addEventListener(name.replace(/^on/, ''), value);
    else if (value === true) el.setAttribute(name, '');
    else if (value !== false) el.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}
