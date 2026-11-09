/** Helpers de DOM seguros: el contenido remoto SIEMPRE entra con textContent (nunca innerHTML). */
export const $ = (sel, root = document) => root.querySelector(sel);

export function setText(node, text) { if (node) node.textContent = text; }

export function el(tag, { cls, attrs = {}, text, children = [] } = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  node.append(...children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
