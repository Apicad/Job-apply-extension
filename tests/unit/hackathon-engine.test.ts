import { it, expect } from 'vitest';
import { scanNative, applyNative, signature } from '../../lib/hackathon/page';
import { planNative } from '../../lib/hackathon/engine';
import { normalizeProfile } from '../../lib/profile';
const env = { isRendered: (el: Element) => !el.hasAttribute('hidden'), assignFiles: () => {} };
function fixture() { document.body.innerHTML = '<form><label>First name<input id="first"></label><label>Email<input id="email" type="email"></label><label>Phone<input id="phone"></label><label>Describe a relevant project.<textarea></textarea></label><label>Signature<input id="signature"></label><button>Submit</button></form>'; return scanNative(document, env); }
it('plans native fields from actual modules and leaves textarea and signature manual', () => {
 const scan = fixture(); const plan = planNative([{ frameId: 0, documentId: 'd', scan }], normalizeProfile({ firstName: 'Ada', email: 'ada@example.com', phone: '555-0100' }));
 expect(plan.filter(p => p.action).map(p => p.field.descriptor.label)).toEqual(['First name', 'Email', 'Phone']);
 expect(plan.find(p => p.field.descriptor.control === 'textarea')?.action).toBeNull();
});
it('rechecks labels, emptiness, scan identity and exact readback without submission', () => {
 const scan = fixture(); const f = scan.fields[0]!; let submits = 0; document.querySelector('form')!.onsubmit = e => { e.preventDefault(); submits++; };
 const command = { ref: f.ref, type: 'text' as const, value: 'Ada', signature: signature(f) };
 document.querySelector('label')!.firstChild!.textContent = 'Last name';
 expect(applyNative(document, env, { scanId: scan.scanId, url: scan.url, actions: [command] })[0]?.ok).toBe(false);
 const fresh = fixture(); const original = fresh.fields[0]!;
 expect(applyNative(document, env, { scanId: scan.scanId, url: scan.url, actions: [command] })[0]?.ok).toBe(false);
 const valid = { ref: original.ref, type: 'text' as const, value: 'Ada', signature: signature(original) };
 expect(applyNative(document, env, { scanId: fresh.scanId, url: fresh.url, actions: [valid] })[0]?.ok).toBe(true);
 expect(applyNative(document, env, { scanId: fresh.scanId, url: fresh.url, actions: [valid] })[0]?.ok).toBe(false);
 expect(submits).toBe(0);
});
it('refuses overlength textarea and unexpected rewrites', () => {
 const scan = fixture(); const field = scan.fields.find(f => f.descriptor.control === 'textarea')!;
 const el = document.querySelector('textarea')!; el.maxLength = 2;
 const updated = scanNative(document, env); const f = updated.fields.find(f => f.descriptor.control === 'textarea')!;
 const action = { ref: f.ref, type: 'answer' as const, value: 'Exact answer.', signature: signature(f) };
 expect(applyNative(document, env, { scanId: updated.scanId, url: updated.url, actions: [action] })[0]?.ok).toBe(false);
 expect(el.value).toBe(''); expect(field).toBeDefined();
});
