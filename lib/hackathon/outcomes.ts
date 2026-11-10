import { record } from './contracts';
export type OutcomeStatus = 'verified' | 'refused' | 'written-unverified' | 'unreachable' | 'unknown';
export interface NativeOutcome { ref: number; ok: boolean; status: OutcomeStatus }
/** Only one well-formed report for each planned ref can establish a result. */
export function collectOutcomes(refs: number[], raw: unknown): NativeOutcome[] {
 const reports = Array.isArray(raw) ? raw.slice(0, 800) : [];
 return refs.map(ref => {
  const matches = reports.filter(item => record(item) && item.ref === ref);
  const item = matches[0];
  if (matches.length !== 1 || !record(item) || !['verified', 'refused', 'written-unverified'].includes(String(item.status)) || item.ok !== (item.status === 'verified')) return { ref, ok: false, status: 'unknown' };
  return { ref, ok: item.ok as boolean, status: item.status as OutcomeStatus };
 });
}
export const outcomeLabel = (status?: OutcomeStatus): string => ({
 verified: 'Verified write', refused: 'Refused; field left unchanged',
 'written-unverified': 'Write attempted, not verified', unreachable: 'Document unreachable; outcome unknown', unknown: 'Outcome unknown; inspect the page',
}[status ?? 'unknown']);
