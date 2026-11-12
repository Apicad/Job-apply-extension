import type { PageEnv } from '../types';
import { shadowHostOf } from './collect';

/**
 * The `PageEnv` for real browsers. Unit tests never rely on it for layout: jsdom lays nothing out,
 * and there `isRendered` answers false for everything (it fails closed), so tests pass a stub.
 */

/** The smallest box, in CSS pixels, that counts as something a person can see and click. */
const MIN_SIDE = 8;

/** Below this opacity (its own times that of every ancestor) an element is as good as invisible. */
const MIN_OPACITY = 0.1;

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
 * 2. It is not nearly transparent either: `checkVisibility` only notices an opacity of exactly 0.
 * 3. What is left of its box after every ancestor has cut or scrolled it is at least 8 by 8 pixels.
 *    This rejects the 1px "visually hidden" box and anything inside a collapsed overflow:hidden parent.
 *    `clip` and `clip-path`, on the element or around it, cut as well.
 * 4. That remainder lies inside the page. Below the fold counts as visible; parked at left: -9999px
 *    does not. For something fixed to the window (`position: fixed`, on the element or around it)
 *    there is no "further down the page": the remainder must lie inside the window as it is now.
 *
 * Anything that cannot be measured counts as not rendered.
 */
function isRendered(el: Element): boolean {
  try {
    const view = el.ownerDocument.defaultView;
    if (view === null || typeof el.checkVisibility !== 'function') return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;

    // The page's own scroller (<html>, or <body> in quirks mode) is not an ancestor like the others:
    // its box moves as the page scrolls. Sites that set html { overflow-y: scroll } would otherwise
    // have the page's scroll position counted twice. `cutByPage` deals with the page.
    const pageScroller = view.document.scrollingElement;

    const ownStyle = view.getComputedStyle(el);
    let box = cutByClip(boxOf(el), el, ownStyle);
    let opacity = opacityOf(ownStyle);
    // True once the box is pinned to the window: no scrolling, of the page or of a panel, moves it.
    let pinned = ownStyle.position === 'fixed';
    let ancestor = parentOf(el);
    for (let depth = 0; ancestor !== null; depth++) {
      if (box === null || depth === MAX_DEPTH || !isBigEnough(box)) return false;
      const style = view.getComputedStyle(ancestor);
      opacity *= opacityOf(style);
      if (ancestor !== pageScroller) box = cutByAncestor(box, ancestor, style, pinned);
      if (box !== null) box = cutByClip(box, ancestor, style);
      // after the cut: a fixed dialog still scrolls its own content
      pinned = pinned || style.position === 'fixed';
      ancestor = parentOf(ancestor);
    }
    if (box === null) return false;
    const reachable = pinned ? cutByWindow(box, view) : cutByPage(box, view);
    return opacity >= MIN_OPACITY && isBigEnough(reachable);
  } catch {
    // a browser too old for checkVisibility options, a detached element, a page that broke its own DOM
    return false;
  }
}

/**
 * What one ancestor leaves of the box. An ancestor with `overflow: hidden` or `clip` cuts off
 * whatever sticks out of it. One that scrolls (`auto`, `scroll`) hides nothing that lies inside its
 * scrollable area, so from there on the question becomes whether the scrolling ancestor itself can
 * be seen: its own box takes over. null means scrolling can never bring the box into view.
 *
 * A box that is pinned to the window is not moved by any ancestor's scrolling: a bottom sheet parked
 * below the window stays there however far the app shell around it is scrolled. For such a box a
 * scrolling ancestor only cuts, like `overflow: hidden`. (In a browser most ancestors do not even
 * cut a fixed box; cutting anyway errs on the side of "not rendered".)
 */
function cutByAncestor(box: Box, ancestor: Element, style: CSSStyleDeclaration, pinned: boolean): Box | null {
  // overflow has no effect on inline boxes (a <label>) or on display:contents
  if (style.display === 'inline' || style.display === 'contents') return box;

  const frame = boxOf(ancestor);
  const cut = { ...box };

  if (!pinned && scrolls(style.overflowX)) {
    const start = box.left - frame.left + ancestor.scrollLeft;
    const end = box.right - frame.left + ancestor.scrollLeft;
    if (end <= 0 || start >= ancestor.scrollWidth) return null;
    cut.left = frame.left;
    cut.right = frame.right;
  } else if (style.overflowX !== 'visible') {
    cut.left = Math.max(box.left, frame.left);
    cut.right = Math.min(box.right, frame.right);
  }

  if (!pinned && scrolls(style.overflowY)) {
    const start = box.top - frame.top + ancestor.scrollTop;
    const end = box.bottom - frame.top + ancestor.scrollTop;
    if (end <= 0 || start >= ancestor.scrollHeight) return null;
    cut.top = frame.top;
    cut.bottom = frame.bottom;
  } else if (style.overflowY !== 'visible') {
    cut.top = Math.max(box.top, frame.top);
    cut.bottom = Math.min(box.bottom, frame.bottom);
  }

  return cut;
}

/**
 * What `clip-path` and `clip` on an element leave of the box. Both cut the element itself and
 * everything drawn inside it, whatever its size: Chosen, a dropdown library, keeps the search box of
 * a closed dropdown at full size inside a drop that carries `clip: rect(0, 0, 0, 0)` and
 * `clip-path: inset(100% 100%)`. Only rectangles are measured. null means the shape is something
 * else (a circle, a polygon, an SVG path), which counts as everything cut away.
 */
function cutByClip(box: Box, el: Element, style: CSSStyleDeclaration): Box | null {
  // an element without a box of its own clips nothing
  if (style.display === 'contents') return box;

  // `getPropertyValue` answers '' for a property the browser does not know, where `style.clip` would be undefined
  const clipPath = style.getPropertyValue('clip-path');
  // `clip`, the older property, only works on absolutely positioned and fixed elements
  const clip = style.position === 'absolute' || style.position === 'fixed' ? style.getPropertyValue('clip') : 'auto';
  const hasClipPath = clipPath !== 'none' && clipPath !== '';
  const hasClip = clip !== 'auto' && clip !== '';
  if (!hasClipPath && !hasClip) return box;

  const frame = boxOf(el);
  const width = frame.right - frame.left;
  const height = frame.bottom - frame.top;
  let cut: Box = box;
  if (hasClipPath) {
    const inset = insetOfClipPath(clipPath, width, height);
    if (inset === null) return null;
    cut = cutToInset(cut, frame, inset);
  }
  if (hasClip) cut = cutToInset(cut, frame, insetOfClip(clip, width, height));
  return cut;
}

/** How far a clip moves each edge of an element's box inwards, in pixels. */
interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function cutToInset(box: Box, frame: Box, inset: Inset): Box {
  return {
    left: Math.max(box.left, frame.left + inset.left),
    top: Math.max(box.top, frame.top + inset.top),
    right: Math.min(box.right, frame.right - inset.right),
    bottom: Math.min(box.bottom, frame.bottom - inset.bottom),
  };
}

/**
 * Reads `clip-path: inset(top right bottom left)` as the browser reports it: "inset(50%)",
 * "inset(0px round 12px)", "inset(10px 20px)". Missing sides mirror the opposite one, as in `margin`.
 * Percentages are of the element's own height (top, bottom) or width (left, right). null for every
 * other shape, and for an inset whose lengths the browser left as a calculation.
 */
function insetOfClipPath(clipPath: string, width: number, height: number): Inset | null {
  // the corner radii after "round" shave off less than our margin of 8 pixels and are ignored
  const match = /^inset\(([^()]*?)(\s+round\s[^()]*)?\)$/.exec(clipPath);
  if (match === null) return null;

  const [top = '', right = top, bottom = top, left = right] = (match[1] ?? '').trim().split(/\s+/);
  return { top: pixels(top, height), right: pixels(right, width), bottom: pixels(bottom, height), left: pixels(left, width) };
}

/**
 * Reads `clip: rect(top, right, bottom, left)` as the browser reports it: "rect(0px, 0px, 0px, 0px)".
 * Unlike an inset, all four are distances from the top left corner of the element; "auto" is its edge.
 */
function insetOfClip(clip: string, width: number, height: number): Inset {
  const [top = '', right = '', bottom = '', left = ''] = clip.replace(/^rect\(|\)$/g, '').trim().split(/[\s,]+/);
  return {
    top: top === 'auto' ? 0 : pixels(top, height),
    right: right === 'auto' ? 0 : width - pixels(right, width),
    bottom: bottom === 'auto' ? 0 : height - pixels(bottom, height),
    left: left === 'auto' ? 0 : pixels(left, width),
  };
}

/**
 * "12px" as 12, "50%" as half of `whole`: the two forms in which a browser reports a length it has
 * worked out. Anything else gives NaN, and a box with such an edge is never big enough.
 */
function pixels(length: string, whole: number): number {
  const amount = Number.parseFloat(length);
  return length.endsWith('%') ? (amount / 100) * whole : amount;
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

/** The part of the box that lies inside the window. Boxes are measured from the window's top left corner already. */
function cutByWindow(box: Box, view: Window): Box {
  return {
    left: Math.max(box.left, 0),
    top: Math.max(box.top, 0),
    right: Math.min(box.right, view.innerWidth),
    bottom: Math.min(box.bottom, view.innerHeight),
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

function opacityOf(style: CSSStyleDeclaration): number {
  const opacity = Number.parseFloat(style.opacity);
  return Number.isNaN(opacity) ? 1 : opacity; // no value means fully opaque
}

function scrolls(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll';
}

/**
 * The element that `el` is drawn inside. That is its parent, with two exceptions for web components:
 * a child of a host that is handed to a <slot> is drawn where the slot is, inside the shadow tree
 * (the collapsed body of an accordion component hides a field that is no descendant of it); and the
 * top of a shadow tree is drawn inside its host.
 */
function parentOf(el: Element): Element | null {
  return el.assignedSlot ?? el.parentElement ?? shadowHostOf(el);
}

/** Puts files into a file input the only way a script can: through a DataTransfer's file list. */
function assignFiles(input: HTMLInputElement, files: readonly File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
}

export const browserEnv: PageEnv = { isRendered, assignFiles };
