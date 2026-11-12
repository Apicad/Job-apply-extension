/** Serialized into the current top frame. Deliberately never activates a control. */
export function revealSubmission(expectedUrl: string): { found: boolean } {
  if (location.href !== expectedUrl) return { found: false };
  const candidates = [...document.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]')].filter(element => {
    const style = getComputedStyle(element);
    if (element.closest('[hidden], [inert], [aria-hidden="true"]') || style.display === 'none' || style.visibility === 'hidden' || !element.getClientRects().length) return false;
    const label = (element.getAttribute('aria-label') || (element instanceof HTMLInputElement ? element.value : element.textContent) || '').trim().replace(/\s+/g, ' ');
    return /^(submit(?: application| your application)?|send application)$/i.test(label);
  });
  if (candidates.length !== 1) return { found: false };
  candidates[0]!.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return { found: true };
}
