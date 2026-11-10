import { it, expect } from 'vitest';
import { collectOutcomes } from '../../lib/hackathon/outcomes';
it('accepts only unique, consistent reports for planned refs; omissions and duplicates are unknown', () => {
 expect(collectOutcomes([1,2,3,4], [
  { ref: 1, ok: true, status: 'verified' }, { ref: 2, ok: true, status: 'verified' }, { ref: 2, ok: false, status: 'refused' },
  { ref: 3, ok: true, status: 'refused' }, { ref: -1, ok: true, status: 'verified' }, { ref: 99, ok: true, status: 'verified' },
 ])).toEqual([{ ref: 1, ok: true, status: 'verified' }, ...[2,3,4].map(ref => ({ ref, ok: false, status: 'unknown' }))]);
});
