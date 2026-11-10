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

/**
 * Fainter than this, a box is there in name only. `checkVisibility` notices an opacity of exactly 0;
 * 0.01 is what a page writes to get past exactly that. A field dimmed to look disabled is nowhere
 * near this low.
 */
const MIN_OPACITY = 0.1;

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
 * 2. It is not faint beyond seeing: its own opacity and that of everything around it, multiplied,
 *    stay at or above 0.1. `filter: opacity()` counts as well.
 * 3. What is left of its box after its own clip, and after every ancestor has clipped, cut or
 *    scrolled it, is at least 8 by 8 pixels. This rejects the 1px "visually hidden" box, anything
 *    inside a collapsed overflow:hidden parent, and a full-size box emptied by `clip-path` or `clip`.
 * 4. That remainder lies inside the page. Below the fold counts as visible; parked at left: -9999px
 *    does not.
 *
 * Anything that cannot be measured counts as not rendered.
 *
 * Out of reach for a check like this one: a field covered by something else, pushed behind the
 * page, painted in the colours of its background, or hidden by a mask image.
 *
 * Two layouts are judged hidden although a person can see them, which only costs a field we could
 * have filled: a positioned box that escapes a clipping ancestor which is not its containing block,
 * and what a right-to-left panel has to be scrolled sideways for.
 */
function isRendered(el: Element): boolean {
  try {
    const view = el.ownerDocument.defaultView;
    if (view === null || typeof el.checkVisibility !== 'function') return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;

    let box: Box | null = boxOf(el);
    let opacity = 1;
    // the element itself first, then everything around it
    let current: Element | null = el;
    for (let depth = 0; current !== null; depth++) {
      if (depth === MAX_DEPTH || !isBigEnough(box)) return false;
      const style = view.getComputedStyle(current);

      opacity *= opacityOf(style);
      if (opacity < MIN_OPACITY) return false;

      box = cutByClip(box, current, style);
      // an element's overflow cuts what is inside it, never the element itself
      if (box !== null && current !== el) box = cutByAncestor(box, current, style);
      if (box === null) return false;
      current = parentOf(current);
    }
    return isBigEnough(cutByPage(box, view));
  } catch {
    // a browser too old for checkVisibility options, a detached element, a page that broke its own DOM
    return false;
  }
}

/** How much of an element shows: its `opacity`, times every opacity() in its `filter`. */
function opacityOf(style: CSSStyleDeclaration): number {
  let opacity = fractionOr(style.opacity, 1);
  for (const [, amount] of (style.filter ?? '').matchAll(/\bopacity\(([^()]*)\)/g)) {
    opacity *= fractionOr(amount ?? '', 1);
  }
  return opacity;
}

/** "0.5" or "50%" as a number from 0 to 1; `otherwise` for anything else (jsdom gives '' where it has no style). */
function fractionOr(text: string, otherwise: number): number {
  const trimmed = text.trim();
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) return otherwise;
  return Math.min(Math.max(trimmed.endsWith('%') ? value / 100 : value, 0), 1);
}

// ---------------------------------------------------------------------------
// clip-path and clip
//
// Both hide whatever lies outside a shape and leave every box as it was, so a field emptied by
// `clip-path: inset(50%)` still measures 200 by 30 pixels. The shape is worked out from the computed
// style, as Chromium writes it, and reduced to the box around it. That is exact for the shapes that
// hide a field (they let through nothing, or next to nothing) and generous for the decorative ones.
// ---------------------------------------------------------------------------

/**
 * What an element's own clip leaves of a box that is that element or lies inside it. null when
 * nothing is left to speak of, or when the shape cannot be worked out here.
 */
function cutByClip(box: Box, el: Element, style: CSSStyleDeclaration): Box | null {
  if (style.display === 'contents') return box; // no box of its own, so nothing to clip with

  const clipPath = (style.clipPath ?? '').trim();
  const clip = (style.clip ?? '').trim();
  const hasClipPath = clipPath !== '' && clipPath !== 'none';
  // the older `clip` only works on absolutely positioned elements
  const hasClip = clip !== '' && clip !== 'auto' && (style.position === 'absolute' || style.position === 'fixed');
  if (!hasClipPath && !hasClip) return box;

  const frame = boxOf(el);
  let cut: Box | null = box;
  if (hasClipPath) cut = within(cut, shapeBox(clipPath, frame));
  if (hasClip) cut = within(cut, clipRectBox(clip, frame));
  return cut;
}

/** The part of a box inside another one; null when either is missing. */
function within(box: Box | null, limit: Box | null): Box | null {
  if (box === null || limit === null) return null;
  return {
    left: Math.max(box.left, limit.left),
    top: Math.max(box.top, limit.top),
    right: Math.min(box.right, limit.right),
    bottom: Math.min(box.bottom, limit.bottom),
  };
}

/** "12px" or "40%" as pixels, a percentage being that share of `whole`; null for anything else (calc(), keywords). */
function pixels(text: string, whole: number): number | null {
  const length = /^(-?\d*\.?\d+(?:e[-+]?\d+)?)(px|%)$/i.exec(text);
  if (length === null) return null;
  const value = Number(length[1]);
  return length[2] === '%' ? (value / 100) * whole : value;
}

/**
 * The box around what a computed `clip-path` lets through, in the coordinates of `frame`, which is
 * the box of the element that carries it. null when the shape cannot be worked out: url(), path(),
 * anything calculated.
 */
function shapeBox(clipPath: string, frame: Box): Box | null {
  const width = frame.right - frame.left;
  const height = frame.bottom - frame.top;
  // "inset(10px) content-box": the box a shape is measured from is taken to be the element's own
  const shape = /^(inset|circle|ellipse|polygon)\((.*)\)(?:\s+[a-z-]+)?$/i.exec(clipPath);
  // a box name alone ("border-box") clips to that box, which is as good as the element's own
  if (shape === null) return /^[a-z-]+$/i.test(clipPath) ? frame : null;
  const kind = (shape[1] ?? '').toLowerCase();
  const inside = (shape[2] ?? '').trim();

  if (kind === 'polygon') {
    // "evenodd, 0px 0px, 100% 0px, 50% 100%": the fill rule, when given, comes first
    const points = inside.split(',').map((point) => point.trim().split(/\s+/));
    if (points[0]?.length === 1) points.shift();
    const xs: number[] = [];
    const ys: number[] = [];
    for (const point of points) {
      const x = point.length === 2 ? pixels(point[0] ?? '', width) : null;
      const y = point.length === 2 ? pixels(point[1] ?? '', height) : null;
      if (x === null || y === null) return null;
      xs.push(x);
      ys.push(y);
    }
    if (xs.length === 0) return null;
    return { left: frame.left + Math.min(...xs), top: frame.top + Math.min(...ys), right: frame.left + Math.max(...xs), bottom: frame.top + Math.max(...ys) };
  }

  if (kind === 'inset') {
    // "1px 2px 3px 4px round 6px": top, right, bottom, left, filled in like margin's short forms
    const offsets = (inside.split(/\s+round\s+/i)[0] ?? '').trim().split(/\s+/);
    if (offsets.length < 1 || offsets.length > 4) return null;
    const top = pixels(offsets[0] ?? '', height);
    const right = pixels(offsets[1] ?? offsets[0] ?? '', width);
    const bottom = pixels(offsets[2] ?? offsets[0] ?? '', height);
    const left = pixels(offsets[3] ?? offsets[1] ?? offsets[0] ?? '', width);
    if (top === null || right === null || bottom === null || left === null) return null;
    return { left: frame.left + left, top: frame.top + top, right: frame.right - right, bottom: frame.bottom - bottom };
  }

  // "circle(40% at 10px 20%)", "ellipse(10px 40% at 0% 0%)"; the centre is the middle when left out
  const [radii = '', centre] = inside.split(/\s*\bat\s+/i);
  const at = centre === undefined ? ['50%', '50%'] : centre.trim().split(/\s+/);
  const x = at.length === 2 ? pixels(at[0] ?? '', width) : null;
  const y = at.length === 2 ? pixels(at[1] ?? '', height) : null;
  if (x === null || y === null) return null;
  const given = radii.trim() === '' ? [] : radii.trim().split(/\s+/);
  // a radius that is left out reaches to the closest side
  const toSideX = Math.min(Math.abs(x), Math.abs(width - x));
  const toSideY = Math.min(Math.abs(y), Math.abs(height - y));
  let radiusX: number | null;
  let radiusY: number | null;
  if (kind === 'circle') {
    if (given.length > 1) return null;
    // a circle's percentage is taken of the box's diagonal, divided by the square root of two
    radiusX = given.length === 0 ? Math.min(toSideX, toSideY) : pixels(given[0] ?? '', Math.hypot(width, height) / Math.SQRT2);
    radiusY = radiusX;
  } else {
    if (given.length !== 0 && given.length !== 2) return null;
    radiusX = given.length === 0 ? toSideX : pixels(given[0] ?? '', width);
    radiusY = given.length === 0 ? toSideY : pixels(given[1] ?? '', height);
  }
  if (radiusX === null || radiusY === null) return null;
  return { left: frame.left + x - radiusX, top: frame.top + y - radiusY, right: frame.left + x + radiusX, bottom: frame.top + y + radiusY };
}

/**
 * The box a computed `clip` lets through: "rect(0px, 0px, 0px, 0px)" is top, right, bottom and left,
 * all four measured from the element's top left corner, and "auto" is the edge itself.
 */
function clipRectBox(clip: string, frame: Box): Box | null {
  const rect = /^rect\((.*)\)$/i.exec(clip);
  const edges = rect === null ? [] : (rect[1] ?? '').trim().split(/[\s,]+/);
  if (edges.length !== 4) return null;
  const width = frame.right - frame.left;
  const height = frame.bottom - frame.top;
  const edge = (text: string | undefined, auto: number): number | null => (text === 'auto' ? auto : pixels(text ?? '', 0));
  const top = edge(edges[0], 0);
  const right = edge(edges[1], width);
  const bottom = edge(edges[2], height);
  const left = edge(edges[3], 0);
  if (top === null || right === null || bottom === null || left === null) return null;
  return { left: frame.left + left, top: frame.top + top, right: frame.left + right, bottom: frame.top + bottom };
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
