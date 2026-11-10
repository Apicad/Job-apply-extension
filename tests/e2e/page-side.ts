/**
 * The page-side code as one script, for the end-to-end tests to put into a page.
 *
 * Until the scan and fill entrypoints exist, this is how lib/page/ gets into a real browser: the
 * tests bundle this file (see extension.ts) and add it to a fixture page, where it appears as
 * `window.__pageSide`. Each function below does in the page what a test wants to know and hands
 * back plain data, the way the real scripts will. Nothing from the trusted side is bundled here:
 * what a description is taken for is decided in the test, outside the page.
 *
 * The script runs in the page's own world, not in the isolated world of a content script. For
 * layout that makes no difference. For writing it is the harder case of the two: here a framework's
 * own `value` property on an element is in the way, which an isolated world would not even see.
 */
import type { FieldDescriptor } from '../../lib/types';
import { collectControls, formIndex } from '../../lib/page/collect';
import { describeControl, isEmpty } from '../../lib/page/describe';
import { fillFile, fillRadio, fillSelect, fillText } from '../../lib/page/fill';
import { browserEnv } from '../../lib/page/layout';
import { isShown } from '../../lib/page/visibility';

export interface ControlOnPage {
  descriptor: FieldDescriptor;
  form: number;
  shown: boolean;
  empty: boolean;
}

/** Every control of the page as a scan would report it. */
export function readControls(): ControlOnPage[] {
  return collectControls(document).map((control) => ({
    descriptor: describeControl(control),
    form: formIndex(control),
    shown: isShown(control, browserEnv),
    empty: isEmpty(control),
  }));
}

export interface VisibilityCase {
  /** The data-case of the block the control sits in. */
  name: string;
  /** What the fixture page says a person could see: "shown" or "hidden". */
  want: string;
  shown: boolean;
}

/**
 * Every control that sits in a block marked data-case, with what the page says about it
 * (data-expect) and what isShown answers with the real layout.
 */
export function readVisibilityCases(): VisibilityCase[] {
  return collectControls(document).flatMap((control) => {
    const block = control.el.closest('[data-case]') ?? hostOf(control.el)?.closest('[data-case]');
    if (block === null || block === undefined) return [];
    return [{ name: block.getAttribute('data-case') ?? '', want: block.getAttribute('data-expect') ?? '', shown: isShown(control, browserEnv) }];
  });
}

function hostOf(el: Element): Element | null {
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function find<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (el === null) throw new Error(`the page has no ${selector}`);
  return el;
}

export function typeInto(selector: string, text: string): boolean {
  return fillText(find<HTMLInputElement | HTMLTextAreaElement>(selector), text);
}

export function chooseOption(selector: string, index: number): boolean {
  return fillSelect(find<HTMLSelectElement>(selector), index);
}

export function chooseRadio(selector: string): boolean {
  return fillRadio(find<HTMLInputElement>(selector));
}

/** Attaches a made-up file, built in the page the way the fill script will build the résumé. */
export function attachFile(selector: string, name: string, type: string, content: string): boolean {
  return fillFile(find<HTMLInputElement>(selector), new File([content], name, { type }), browserEnv.assignFiles);
}

/** True when the element is rendered as far as the real layout can tell. */
export function isRendered(selector: string): boolean {
  return browserEnv.isRendered(find(selector));
}
