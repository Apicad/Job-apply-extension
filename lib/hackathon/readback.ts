import { classifyField } from '../classify';
import { closestAcrossShadow, holdsAnotherField } from '../page/collect';
import { isHiddenByMarkup } from '../page/visibility';
import type { FieldDescriptor, PageEnv } from '../types';

/** Formatting may change, but no country-code, subscriber or extension digit may disappear. */
function phoneParts(value: string): { number: string; extension: string } | null {
 const trimmed = value.trim();
 const extension = /\s*(?:ext(?:ension)?\.?|x|#)\s*(\d+)\s*$/i.exec(trimmed);
 const main = extension ? trimmed.slice(0, extension.index).trim() : trimmed;
 if (!/^\+?[\d\s().-]+$/.test(main)) return null;
 const number = main.replace(/\D/g, '');
 return number.length >= 7 && number.length <= 15 ? { number, extension: extension?.[1] ?? '' } : null;
}

export function textReadbackMatches(descriptor: FieldDescriptor, expected: string, actual: string): boolean {
 if (expected === actual) return true;
 if (classifyField(descriptor) !== 'phone') return false;
 const a = phoneParts(expected); const b = phoneParts(actual);
 return !!a && !!b && a.number === b.number && a.extension === b.extension;
}

export interface UploadWitness {
 widget: WeakRef<Element>;
 document: WeakRef<Document>;
 form: WeakRef<HTMLFormElement> | null;
 label: WeakRef<Element> | null;
 labelText: string;
 identity: string;
 filename: string;
 requiresAcknowledgement: boolean;
}
const attr = (el: Element, name: string) => Element.prototype.getAttribute.call(el, name) ?? '';
const identity = (el: Element) => JSON.stringify(['id', 'role', 'aria-label', 'aria-labelledby'].map(name => attr(el, name)));
const visible = (el: Element, env: PageEnv) => !isHiddenByMarkup(el) && env.isRendered(el);

/** Keep the original named group, never search the document for a matching filename later. */
export function rememberUpload(input: HTMLInputElement, descriptor: FieldDescriptor, filename: string): UploadWitness | null {
 if (classifyField(descriptor) !== 'resume') return null;
 const widget = closestAcrossShadow(input, '[role="group" i]');
 if (!widget || widget.matches('form, body, html') || holdsAnotherField(widget, [input])) return null;
 const labelIds = attr(widget, 'aria-labelledby').trim().split(/\s+/).filter(Boolean);
 const label = labelIds.length === 1 ? Document.prototype.getElementById.call(input.ownerDocument, labelIds[0]!) : null;
 if (label?.matches('form, body, html')) return null;
 const labelText = label?.textContent?.trim() || attr(widget, 'aria-label').trim();
 if (!labelText || classifyField({ ...descriptor, label: labelText, groupLabel: labelText }) !== 'resume') return null;
 return { widget: new WeakRef(widget), document: new WeakRef(input.ownerDocument), form: input.form ? new WeakRef(input.form) : null,
  label: label ? new WeakRef(label) : null, labelText, identity: identity(widget), filename, requiresAcknowledgement: widget.classList.contains('file-upload') };
}

function uploadSnapshot(witness: UploadWitness, doc: Document, env: PageEnv): { widget: Element; elements: Element[] } | null {
 const widget = witness.widget.deref(); const label = witness.label?.deref();
 if (!widget?.isConnected || widget.ownerDocument !== doc || witness.document.deref() !== doc || identity(widget) !== witness.identity || !visible(widget, env)) return null;
 if (witness.form && (!witness.form.deref()?.isConnected || Element.prototype.closest.call(widget, 'form') !== witness.form.deref())) return null;
 if (witness.label && (!label?.isConnected || label.ownerDocument !== doc || label.textContent?.trim() !== witness.labelText || Document.prototype.getElementById.call(doc, label.id) !== label)) return null;
 if (!witness.label && attr(widget, 'aria-label').trim() !== witness.labelText) return null;
 const elements = Array.from(Element.prototype.querySelectorAll.call(widget, '*')) as Element[];
 return { widget, elements };
}
function uploadBlocked(widget: Element, elements: Element[], env: PageEnv): boolean {
 return [widget, ...elements].some(el => visible(el, env) && (
  attr(el, 'aria-busy') === 'true' || attr(el, 'role') === 'progressbar' || el.localName === 'progress' ||
  attr(el, 'aria-invalid') === 'true' || attr(el, 'role') === 'alert' ||
  /(?:^|[ _-])(?:error|failure|failed|uploading|loading)(?:$|[ _-])/.test(attr(el, 'class'))
 ));
}

/** Ordinary accessible upload groups keep the native input and need no custom Remove control. */
export function mayVerifyNativeUpload(witness: UploadWitness, doc: Document, env: PageEnv): boolean {
 const snapshot = uploadSnapshot(witness, doc, env);
 return !witness.requiresAcknowledgement && !!snapshot && !uploadBlocked(snapshot.widget, snapshot.elements, env);
}

/** A React upload replaces its input with a filename and Remove file control after completion. */
export function uploadedFileVisible(witness: UploadWitness, doc: Document, env: PageEnv): boolean {
 const snapshot = uploadSnapshot(witness, doc, env);
 if (!snapshot || uploadBlocked(snapshot.widget, snapshot.elements, env)) return false;
 const { elements } = snapshot;
 // A filename alone may be a failed-upload preview. Require completion and reject errors/busy state.
 if (elements.some(el => el.matches('input:not([type="hidden"]), select, textarea') && visible(el, env))) return false;
 const named = elements.some(el => el.childElementCount === 0 && el.textContent?.trim() === witness.filename && visible(el, env));
 const remove = elements.some(el => el.localName === 'button' && !el.matches(':disabled') && visible(el, env) &&
  /^remove (?:file|attachment|résumé|resume|cv)$/i.test((attr(el, 'aria-label') || el.textContent || '').trim()));
 return named && remove;
}
