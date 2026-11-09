import { el } from '../utils/dom.js';

export function toast(text, { error = false, ms = 3500 } = {}) {
  const zone = document.getElementById('toast-zone');
  if (!zone) return;
  const node = el('div', { cls: `toast-msg${error ? ' error' : ''}`, text });
  zone.append(node);
  while (zone.children.length > 3) zone.firstChild.remove();
  setTimeout(() => node.remove(), ms);
}
