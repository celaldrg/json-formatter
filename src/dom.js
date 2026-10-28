import { t } from './i18n.js';

/**
 * Small DOM helpers shared by the views. Text always goes in through textContent or attributes,
 * never as HTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** data-i18n-* attributes and the attribute each one translates. */
const TRANSLATED_ATTRIBUTES = Object.freeze([
  ['i18nPlaceholder', 'placeholder'],
  ['i18nTitle', 'title'],
  ['i18nAriaLabel', 'aria-label'],
]);

/**
 * @param {string} id
 * @returns {HTMLElement} the element; throws when index.html lacks it
 */
export function byId(id) {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`index.html has no #${id}`);
  return element;
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text] set as textContent
 * @returns {HTMLElement}
 */
export function create(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/**
 * An icon from the SVG sprite in index.html.
 * @param {string} name symbol id without the "i-" prefix
 * @param {string} [className]
 * @returns {SVGSVGElement}
 */
export function icon(name, className = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/**
 * Translates the static page: data-i18n sets the text, data-i18n-placeholder, -title and
 * -aria-label set those attributes.
 * @param {ParentNode} root
 * @param {string} lang
 */
export function translatePage(root, lang) {
  for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = t(lang, element.dataset.i18n);
  for (const [property, attribute] of TRANSLATED_ATTRIBUTES) {
    const selector = `[data-${property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
    for (const element of root.querySelectorAll(selector)) element.setAttribute(attribute, t(lang, element.dataset[property]));
  }
}
