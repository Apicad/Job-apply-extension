import type { PageEnv } from '../types';
import { closestAcrossShadow, collectControls, eachElement, elementById, formIndexForOwner, matchesSelector, shadowHostOf } from './collect';
import { isHiddenByMarkup, isRadioSeen, isShown } from './visibility';
import { sanitizeManualControls, type ManualControl } from '../hackathon/manual-controls';

const HTML = 'http://www.w3.org/1999/xhtml';
const NATIVE = 'input:not([type="hidden" i]), select, textarea';
const SEMANTIC = '[role~="combobox" i], [role~="listbox" i], [role~="checkbox" i], [role~="radio" i], [role~="radiogroup" i], button[aria-haspopup="listbox" i], [role~="button" i][aria-haspopup="listbox" i]';
const GROUP = 'fieldset, [role~="group" i], [role~="radiogroup" i]';
const attr = (el: Element, name: string): string => (Element.prototype.getAttribute.call(el, name) ?? '').trim();
const role = (el: Element, value: string): boolean => attr(el, 'role').toLowerCase().split(/\s+/).includes(value);
function owner(el: Element): HTMLFormElement | null {
  // Only native form-associated buttons honor form="...". ARIA divs belong
  // to their same-tree form ancestor; a shadow host's form is not theirs.
  return el.localName === 'button' ? (el as HTMLButtonElement).form : Element.prototype.closest.call(el, 'form') as HTMLFormElement | null;
}
function kindOf(el: Element): ManualControl['kind'] {
  return role(el, 'checkbox') ? 'checkbox' : role(el, 'radio') || role(el, 'radiogroup') ? 'radio' : 'combobox';
}
function sameScope(a: Element, b: Element): boolean { return a.getRootNode() === b.getRootNode() && owner(a) === owner(b); }
function containsAcrossShadow(container: Element, node: Element): boolean {
  for (let current: Element | null = node; current; current = shadowHostOf(current)) if (container.contains(current)) return true;
  return false;
}
function nativeBacked(el: Element, native: Set<Element>): boolean {
  if (matchesSelector(el, 'input, select, textarea') || [...native].some(control => containsAcrossShadow(el, control))) return true;
  const label = Element.prototype.closest.call(el, 'label');
  if (!label) return false;
  const target = attr(label, 'for') ? elementById(label, attr(label, 'for')) : null;
  return [...native].some(control => containsAcrossShadow(label, control)) || !!target && native.has(target);
}
function textOf(el: Element): string {
  const walker = Document.prototype.createTreeWalker.call(el.ownerDocument, el, NodeFilter.SHOW_TEXT);
  const parts: string[] = []; let length = 0;
  while (walker.nextNode() && length < 4000) {
    const text = walker.currentNode as Text; const parent = text.parentElement;
    if (!parent) continue;
    const excluded = Element.prototype.closest.call(parent, 'input, select, textarea, script, style, noscript, svg, [role~="option" i], [hidden], [inert], [aria-hidden="true" i]');
    if (excluded && excluded !== el && el.contains(excluded)) continue;
    const piece = text.data.slice(0, 4000 - length); parts.push(piece); length += piece.length;
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().replace(/[\s:*✱]+$/, '');
}
function named(el: Element): string {
  const references = attr(el, 'aria-labelledby').split(/\s+/).filter(Boolean).slice(0, 20);
  const text = references.map(id => elementById(el, id)).filter((target): target is Element => !!target && target !== el && !matchesSelector(target, `${NATIVE}, ${SEMANTIC}`)).map(textOf).join(' ').trim();
  return text || attr(el, 'aria-label');
}
function labelOf(el: Element, members: Element[], kind: ManualControl['kind']): string {
  const explicit = named(el); if (explicit) return explicit;
  if (el.localName === 'fieldset') { const legend = el.querySelector(':scope > legend'); if (legend && textOf(legend)) return textOf(legend); }
  const id = attr(el, 'id'); const root = el.getRootNode();
  if (id && 'querySelectorAll' in root) {
    const labels = root.nodeType === Node.DOCUMENT_NODE ? Document.prototype.querySelectorAll.call(root as Document, 'label') : (root as ShadowRoot).querySelectorAll('label');
    const labelled = Array.from(labels).filter(label => attr(label, 'for') === id).map(textOf).join(' ').trim();
    if (labelled) return labelled;
  }
  if (kind === 'checkbox' && members.length === 1) {
    const enclosing = Element.prototype.closest.call(el, 'label');
    const own = enclosing && !enclosing.querySelector(NATIVE) ? textOf(enclosing) : textOf(el);
    if (own) return own;
  }
  return kind === 'combobox' ? 'Custom dropdown' : kind === 'radio' ? 'Radio question' : 'Checkbox question';
}

/** Observes unsupported semantic widgets without entering the fill handle table. */
export function collectManualControls(doc: Document, env: PageEnv): ManualControl[] {
  const candidates: Element[] = []; const all: Element[] = []; const authForms = new Set<HTMLFormElement>();
  const native = new Set<Element>(collectControls(doc).filter(control => isShown(control, env)).flatMap(control => control.control === 'radio' ? control.radios : [control.el]));
  eachElement(doc, el => { if (el.namespaceURI === HTML && el.localName === 'input' && (el as HTMLInputElement).type === 'checkbox' && isRadioSeen(el as HTMLInputElement, env)) native.add(el); });
  eachElement(doc, el => {
    if (el.namespaceURI !== HTML) return;
    if (el.localName === 'input' && (el as HTMLInputElement).type === 'password' && (el as HTMLInputElement).form) authForms.add((el as HTMLInputElement).form!);
    if (all.length < 4000 && (matchesSelector(el, SEMANTIC) || el.hasAttribute('aria-controls') || el.hasAttribute('aria-owns'))) all.push(el);
    if (candidates.length < 2000 && matchesSelector(el, SEMANTIC) && !nativeBacked(el, native)) candidates.push(el);
  });
  // A linked listbox is the menu of its controller, not another question.
  const menus = new Set<Element>();
  for (const controller of all) {
    if (!role(controller, 'combobox') && attr(controller, 'aria-haspopup').toLowerCase() !== 'listbox' && !matchesSelector(controller, 'input[aria-autocomplete="list" i], input[aria-autocomplete="both" i]')) continue;
    for (const id of `${attr(controller, 'aria-controls')} ${attr(controller, 'aria-owns')}`.split(/\s+/).filter(Boolean).slice(0, 20)) {
      const target = elementById(controller, id); if (target && role(target, 'listbox')) menus.add(target);
    }
  }
  const allowed = candidates.filter(el => ![...menus].some(menu => menu === el || menu.contains(el)) && !isHiddenByMarkup(el) && env.isRendered(el) &&
    !closestAcrossShadow(el, 'search, [role~="search" i]') && !authForms.has(owner(el)!) &&
    !/(?:^|\s)(?:cc-\S+|one-time-code|username|current-password|new-password)(?:\s|$)/i.test(attr(el, 'autocomplete')));
  const groups: { anchor: Element; kind: ManualControl['kind']; members: Element[] }[] = [];
  for (const el of allowed) {
    const kind = kindOf(el); let anchor = el;
    if (kind !== 'combobox') {
      for (let parent = el.parentElement; parent && !matchesSelector(parent, 'form, body, html'); parent = parent.parentElement) {
        if (!matchesSelector(parent, GROUP) || !sameScope(parent, el) || nativeBacked(parent, native)) continue;
        const members = candidates.filter(other => parent.contains(other));
        if (!members.length || members.some(other => !sameScope(el, other) || kindOf(other) !== kind)) continue;
        anchor = parent; break;
      }
    }
    // A radiogroup already names all of its nested radio options.
    const containing = groups.find(group => group.kind === kind && sameScope(group.anchor, el) && (group.anchor === anchor || role(group.anchor, 'radiogroup') && group.anchor.contains(el)));
    if (containing) containing.members.push(el);
    else groups.push({ anchor, kind, members: [el] });
  }
  return sanitizeManualControls(groups.slice(0, 100).map((group, index) => ({
    id: `manual-${index}`, form: formIndexForOwner(owner(group.anchor), doc), kind: group.kind,
    label: labelOf(group.anchor, group.members, group.kind),
    required: attr(group.anchor, 'aria-required') === 'true' || group.members.some(el => attr(el, 'aria-required') === 'true'),
  }))) ?? [];
}
