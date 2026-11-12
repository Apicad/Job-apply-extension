/** Conservative evidence boundary for duration and personal ownership assertions.
 * Require the complete claim unit in a cited fact, not independently matching
 * numbers, technology names or ownership words. This deliberately sends changed
 * phrasing to review rather than pretending to prove semantic equivalence.
 */
const units = (text: string): string[] => text.toLowerCase().replace(/[’]/g, "'")
 .split(/(?<!\d)[.!?]|[.!?](?!\d)|[;\n\r]+/)
 .map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const duration = /\b(?:years?|months?|weeks?|days?|decades?)\b|\b(?:yr|yrs|mos)\b/i;
const ownership = /\b(?:sole|solely|alone|independently|single[ -]handedly|from scratch|from the ground up|on my own|by myself|without (?:any )?(?:help|assistance)|end[ -]to[ -]end|entirely|exclusively|only (?:developer|author|contributor)|most proud|proudest)\b/i;
export function protectedClaimGaps(text: string, support: string): string[] {
 const evidence = new Set(units(support));
 return units(text).flatMap(claim => {
  if (evidence.has(claim)) return [];
  if (duration.test(claim)) return ['Duration claim requires explicit matching cited evidence for its subject and time unit.'];
  if (ownership.test(claim)) return ['Ownership or personal distinction claim requires explicit matching cited evidence.'];
  return [];
 });
}
