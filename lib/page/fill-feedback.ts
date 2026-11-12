/** Cosmetic feedback only after readback succeeds; never delays or activates controls. */
export function pulseFilledField(el: HTMLElement): void {
 try {
  if (el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  el.animate?.([
   { boxShadow: '0 0 0 0 rgba(38, 132, 83, 0)' },
   { boxShadow: '0 0 0 5px rgba(38, 132, 83, .6)', offset: .25 },
   { boxShadow: '0 0 0 0 rgba(38, 132, 83, 0)' },
  ], { duration: 1400, iterations: 1 });
 } catch { /* Animation support cannot affect a fill result. */ }
}
