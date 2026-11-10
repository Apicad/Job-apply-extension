import type { PageEnv } from '../types';
import { shadowHostOf } from './collect';

/**
 * The `PageEnv` for real browsers. Unit tests never rely on it for layout: jsdom lays nothing out,
 * and there `isRendered` answers false for everything (it fails closed), so tests pass a stub.
 */

/** The smallest box, in CSS pixels, that counts as something a person can see and click. */
const MIN_SIDE = 8;

/** Deeper than any real page; reaching it means the ancestor chain cannot be trusted. */
const MAX_DEPTH = 500;

/** Edges in the coordinates of `getBoundingClientRect` (relative to the viewport). */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * True when a person could see the element, by scrolling if need be. All of these must hold:
 *
 * 1. `checkVisibility` says it has a box and is neither transparent, `visibility: hidden` nor skipped
 *    content. (Without the three options it would call an opacity:0 honeypot visible.)
 * 2. What is left of its box after every ancestor has cut or scrolled it is at least 8 by 8 pixels.
 *    This rejects the 1px "visually hidden" box and anything inside a collapsed overflow:hidden parent.
 * 3. That remainder lies inside the page. Below the fold counts as visible; parked at left: -9999px
 *    does not.
 *
 * Anything that cannot be measured counts as not rendered.
 */
function isRendered(el: Element): boolean {
  try {
    const view = el.ownerDocument.defaultView;
    if (view === null || typeof el.checkVisibility !== 'function') return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;

    let box: Box | null = boxOf(el);
    let ancestor = parentOf(el);
    for (let depth = 0; ancestor !== null; depth++) {
      if (depth === MAX_DEPTH || !isBigEnough(box)) return false;
      box = cutByAncestor(box, ancestor, view.getComputedStyle(ancestor));
      if (box === null) return false;
      ancestor = parentOf(ancestor);
    }
    return isBigEnough(cutByPage(box, view));
  } catch {
    // a browser too old for checkVisibility options, a detached element, a page that broke its own DOM
    return false;
  }
}

/**
 * What one ancestor leaves of the box. An ancestor with `overflow: hidden` or `clip` cuts off
 * whatever sticks out of it. One that scrolls (`auto`, `scroll`) hides nothing that lies inside its
 * scrollable area, so from there on the question becomes whether the scrolling ancestor itself can
 * be seen: its own box takes over. null means scrolling can never bring enough of the box into view.
 */
function cutByAncestor(box: Box, ancestor: Element, style: CSSStyleDeclaration): Box | null {
  // overflow has no effect on inline boxes (a <label>) or on display:contents
  if (style.display === 'inline' || style.display === 'contents') return box;

  const frame = boxOf(ancestor);
  const cut = { ...box };

  if (scrolls(style.overflowX)) {
    if (!canScrollIntoView(box.left - frame.left + ancestor.scrollLeft, box.right - frame.left + ancestor.scrollLeft, ancestor.scrollWidth)) {
      return null;
    }
    cut.left = frame.left;
    cut.right = frame.right;
  } else if (style.overflowX !== 'visible') {
    cut.left = Math.max(box.left, frame.left);
    cut.right = Math.min(box.right, frame.right);
  }

  if (scrolls(style.overflowY)) {
    if (!canScrollIntoView(box.top - frame.top + ancestor.scrollTop, box.bottom - frame.top + ancestor.scrollTop, ancestor.scrollHeight)) {
      return null;
    }
    cut.top = frame.top;
    cut.bottom = frame.bottom;
  } else if (style.overflowY !== 'visible') {
    cut.top = Math.max(box.top, frame.top);
    cut.bottom = Math.min(box.bottom, frame.bottom);
  }

  return cut;
}

/**
 * True when scrolling can show at least the smallest visible side of a box along one direction.
 * `start` and `end` are the box's edges measured from the start of the scrollable area, which is
 * `size` long. What lies in front of that area or beyond its end is cut off for good: a box at
 * left: -195px in a panel shows 5 of its 200 pixels however far the panel is scrolled.
 */
function canScrollIntoView(start: number, end: number, size: number): boolean {
  return Math.min(end, size) - Math.max(start, 0) >= MIN_SIDE;
}

/** The part of the box that lies inside the document, which runs from its top left corner to its scroll size. */
function cutByPage(box: Box, view: Window): Box {
  const page = view.document.scrollingElement ?? view.document.documentElement;
  // the box is measured from the viewport; adding the scroll position measures it from the page
  return {
    left: Math.max(box.left + view.scrollX, 0),
    top: Math.max(box.top + view.scrollY, 0),
    right: Math.min(box.right + view.scrollX, page.scrollWidth),
    bottom: Math.min(box.bottom + view.scrollY, page.scrollHeight),
  };
}

function boxOf(el: Element): Box {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function isBigEnough(box: Box): boolean {
  // a comparison with NaN is false, so a box that could not be measured is never big enough
  return box.right - box.left >= MIN_SIDE && box.bottom - box.top >= MIN_SIDE;
}

function scrolls(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll';
}

/** The parent element, or the host when `el` sits at the top of a shadow tree. */
function parentOf(el: Element): Element | null {
  return el.parentElement ?? shadowHostOf(el);
}

/** Puts files into a file input the only way a script can: through a DataTransfer's file list. */
function assignFiles(input: HTMLInputElement, files: readonly File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
}

export const browserEnv: PageEnv = { isRendered, assignFiles };
