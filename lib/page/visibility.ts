import type { IsShown, PageEnv } from '../types';
import { closestAcrossShadow, matchesSelector, ownLabels, ownWrappers, shadowHostOf, uploadWidgetOf } from './collect';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Markup that takes an element and everything inside it away from the user. */
const HIDING_MARKUP = '[hidden], [inert], [aria-hidden="true" i]';

const CLOSED_DETAILS = 'details:not([open])';

/** How far up a hidden radio or combobox input may look for the styled box the user sees instead of it. */
const STYLED_BOX_LEVELS = 3;

/** What a person clicks to open the file picker when the input itself is hidden. */
const CLICKABLE = 'label, button, [role="button" i], input[type="button" i]';

/**
 * Product rule 4: never fill a field the user cannot see. A text box, textarea or dropdown must be
 * visible itself. A radio or a file input may be hidden behind a styled control (a label, a wrapper,
 * an "Attach" button), but only when that control is visible. So may the input of a custom dropdown,
 * which is only ever reported, never written. What the markup itself hides stays hidden whatever
 * stands beside it. Disabled and read-only controls are never shown: they are not the user's to change.
 */
export const isShown: IsShown = (control, env) => {
  if (control.control === 'radio') {
    // Options that cannot be chosen do not have to be seen; every option that can be chosen does,
    // because any of them may be the one that gets clicked.
    const choosable = control.radios.filter((radio) => !isDisabled(radio));
    if (choosable.length === 0 || choosable.some(isReadOnly)) return false;
    return choosable.every((radio) => isRadioSeen(radio, env));
  }

  if (isDisabled(control.el) || isReadOnly(control.el)) return false;
  if (control.control === 'file') return isFileInputSeen(control.el, env);
  if (control.control === 'combobox') return isComboboxSeen(control.el, env);
  return isSeen(control.el, env);
};

/**
 * True when the markup alone says the element is not there for a person: no layout needed, so this
 * part of product rule 4 runs in unit tests too. What CSS hides is `PageEnv.isRendered`'s business.
 */
export function isHiddenByMarkup(el: Element): boolean {
  if (matchesSelector(el, 'input[type="hidden" i]')) return true;
  if (closestAcrossShadow(el, HIDING_MARKUP) !== null) return true;
  return isInsideClosedDetails(el);
}

/** A closed <details> shows nothing but its first <summary>. */
function isInsideClosedDetails(el: Element): boolean {
  let details = closestAcrossShadow(el, CLOSED_DETAILS);
  while (details !== null) {
    if (details !== el) {
      const summary = details.querySelector(':scope > summary');
      if (summary === null || !summary.contains(el)) return true;
    }
    // a <details> is never a form, so its own properties can be read
    const above = details.parentElement ?? shadowHostOf(details);
    details = above === null ? null : closestAcrossShadow(above, CLOSED_DETAILS);
  }
  return false;
}

/** True when a person can see this very element. */
function isSeen(el: Element, env: PageEnv): boolean {
  return !isHiddenByMarkup(el) && env.isRendered(el);
}

/**
 * A radio is seen when it is visible itself or when the thing drawn in its place is. Ashby's radios
 * are invisible overlays on a drawn circle with a label beside them; button-style radios hide the
 * input inside its label. A radio that has a label is judged by that label alone, so an option
 * hidden by hiding its label is not rescued by the list item around it. Only a radio without any
 * label may be vouched for by its own wrapper.
 */
/** Also used for read-only checkbox observations; this does not grant any write capability. */
export function isRadioSeen(radio: HTMLInputElement, env: PageEnv): boolean {
  if (isHiddenByMarkup(radio)) return false;
  if (env.isRendered(radio)) return true;

  const labels = ownLabels(radio);
  if (labels.length > 0) return labels.some((label) => isSeen(label, env));
  return isStyledBoxSeen(radio, env);
}

/**
 * The input of a custom dropdown is often next to nothing. React-Select, which draws every dropdown
 * on Greenhouse, keeps it a few pixels wide while empty and makes it transparent once an option is
 * chosen; what a person sees is the styled box around it. Such an input is seen when that box is.
 * A combobox is never written to, so this only decides whether it is reported.
 */
function isComboboxSeen(input: HTMLInputElement, env: PageEnv): boolean {
  if (isHiddenByMarkup(input)) return false;
  return env.isRendered(input) || isStyledBoxSeen(input, env);
}

/** True when a wrapper that holds this control and no other field, at most three levels up, is seen. */
function isStyledBoxSeen(el: HTMLInputElement, env: PageEnv): boolean {
  return ownWrappers([el], STYLED_BOX_LEVELS).some((wrapper) => isSeen(wrapper, env));
}

/**
 * Upload widgets hide the real file input on purpose: Greenhouse clips it to 1px beside a visible
 * "Attach" button, Lever lays it invisibly over a link inside the field's label. Such an input is
 * seen when a label of its own, or a label or button inside the widget that holds only this input,
 * is visible. A concealed file input with nothing to click around it stays unseen.
 */
function isFileInputSeen(input: HTMLInputElement, env: PageEnv): boolean {
  if (isHiddenByMarkup(input)) return false;
  if (env.isRendered(input)) return true;

  const standIns: Element[] = ownLabels(input);
  const widget = uploadWidgetOf(input);
  if (widget !== null) standIns.push(...widget.querySelectorAll(CLICKABLE));
  return standIns.some((standIn) => isSeen(standIn, env));
}

function isDisabled(el: FormControl): boolean {
  // :disabled also covers a control inside <fieldset disabled>, where `el.disabled` itself is false
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
}

function isReadOnly(el: FormControl): boolean {
  return ('readOnly' in el && el.readOnly) || el.getAttribute('aria-readonly') === 'true';
}
