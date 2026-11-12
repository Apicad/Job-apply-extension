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
 const command = { ref: f.ref, type: 'text' as const, value: 'Ada', signature: signature(f)! };
 document.querySelector('label')!.firstChild!.textContent = 'Last name';
 expect(applyNative(document, env, { scanId: scan.scanId, url: scan.url, actions: [command] })[0]?.ok).toBe(false);
 const fresh = fixture(); const original = fresh.fields[0]!;
 expect(applyNative(document, env, { scanId: scan.scanId, url: scan.url, actions: [command] })[0]?.ok).toBe(false);
 const valid = { ref: original.ref, type: 'text' as const, value: 'Ada', signature: signature(original)! };
 expect(applyNative(document, env, { scanId: fresh.scanId, url: fresh.url, actions: [valid] })[0]?.ok).toBe(true);
 expect(applyNative(document, env, { scanId: fresh.scanId, url: fresh.url, actions: [valid] })[0]?.ok).toBe(false);
 expect(submits).toBe(0);
});
it('refuses overlength textarea and unexpected rewrites', () => {
 const scan = fixture(); const field = scan.fields.find(f => f.descriptor.control === 'textarea')!;
 const el = document.querySelector('textarea')!; el.maxLength = 2;
 const updated = scanNative(document, env); const f = updated.fields.find(f => f.descriptor.control === 'textarea')!;
 const action = { ref: f.ref, type: 'answer' as const, value: 'Exact answer.', signature: signature(f)! };
 expect(applyNative(document, env, { scanId: updated.scanId, url: updated.url, actions: [action] })[0]?.ok).toBe(false);
 expect(el.value).toBe(''); expect(field).toBeDefined();
});

it('Grok F1 regression: complete safety tails survive describe → guard → planner, or fields fail closed', async () => {
 const { sanitizeFrameScan } = await import('../../lib/report');
 const cases = [
  `<fieldset><legend>${'context '.repeat(40)}you certify</legend><label>Full name<input></label></fieldset>`,
  `<label>Are you legally authorized to work in the United States ${'context '.repeat(45)}without the need for employer sponsorship?<select><option value="">Select</option><option>Yes</option><option>No</option></select></label>`,
  `<label>Are you legally authorized to work in the United States?<select><option value="">Select</option><option>Yes ${'context '.repeat(45)}I acknowledge and certify</option><option>No</option></select></label>`,
 ];
 for (const markup of cases) {
  document.body.innerHTML = `<form><label>First name<input></label><label>Email<input></label><label>Phone<input></label>${markup}</form>`;
  const raw = scanNative(document, env);
  const guarded = sanitizeFrameScan({ ...raw, top:true,childOrigins:[],error:'' })!;
  const scan = {...raw,fields:guarded.fields.map(f=>({...f,maxLength:-1}))};
  const rows = planNative([{frameId:0,documentId:'d',scan}],normalizeProfile({firstName:'Ada',lastName:'Lovelace',email:'ada@example.com',phone:'555-0100',country:'United States',workAuthorization:'yes'}));
  expect(rows.slice(3).filter(r=>r.action)).toHaveLength(0);
 }
});

it('signature cue in placeholder is manual even with a short recognized label', () => {
 const scan = fixture(); document.querySelector('#first')!.setAttribute('placeholder','Type your signature');
 const fresh = scanNative(document,env);
 const rows=planNative([{frameId:0,documentId:'d',scan:fresh}],normalizeProfile({firstName:'Ada',email:'ada@example.com',phone:'555-0100'}));
 expect(rows[0]?.action).toBeNull();expect(scan).toBeDefined();
});

it.each(['\u00ad', '\u200b', '\u200e', '\u2060', '\ufeff'])('AB-3/C-4: canonical heading and question tolerate %s but reject meaningful relabeling', async (invisible) => {
 const { inspectNative } = await import('../../lib/hackathon/page');
 const { sanitizeFrameScan } = await import('../../lib/report');
 fixture(); document.body.insertAdjacentHTML('afterbegin', '<h1>Sample Developer</h1>');
 document.querySelector('h1')!.textContent = `Sample Dev${invisible}eloper`;
 document.querySelector('textarea')!.parentElement!.firstChild!.textContent = `Describe a relevant pro${invisible}ject.`;
 const raw = scanNative(document, env); const clean = sanitizeFrameScan({ ...raw, top: true, childOrigins: [], error: '' })!;
 const f = raw.fields.find(field => field.descriptor.control === 'textarea')!;
 const action = { ref: f.ref, type: 'answer' as const, value: 'Project description.', signature: signature(f)! };
 const command = { job: clean.job, scanId: raw.scanId, url: raw.url, actions: [action] };
 expect(inspectNative(document, env, command)).toBe(true);
 document.querySelector('h1')!.textContent = 'Other job'; expect(inspectNative(document, env, command)).toBe(false);
});
it('C-4: oversized option values remain manual instead of signing a truncated choice', () => {
 fixture(); document.querySelector('form')!.insertAdjacentHTML('beforeend', `<label>Country<select><option value="">Select</option><option value="${'x'.repeat(201)}">United States</option></select></label>`);
 expect(scanNative(document, env).fields.some(f => f.descriptor.control === 'select')).toBe(false);
});

it('fills the explicit location question from saved location, preserves custom widgets and respects section settings', () => {
 document.body.innerHTML='<form><label>First name<input></label><label>Email<input type="email"></label><label>Phone<input></label><label>Where are you located? <input id="where"></label><label>Current location<input role="combobox"></label></form>';
 const scan=scanNative(document,env); const frames=[{frameId:0,documentId:'d',scan}];
 const profile=normalizeProfile({city:'South San Francisco',state:'California',country:'United States'});
 const plan=planNative(frames,profile);
 expect(plan.find(r=>r.field.descriptor.label==='Where are you located?')?.action).toMatchObject({type:'text',value:'South San Francisco, California, United States'});
 expect(plan.find(r=>r.field.descriptor.control==='combobox')?.action).toBeNull();
 expect(planNative(frames,{...profile,fillLocation:'no'}).every(r=>!r.action)).toBe(true);
});
