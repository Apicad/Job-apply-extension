import { it, expect } from 'vitest';
import { scanNative } from '../../lib/hackathon/page';
import { planNative } from '../../lib/hackathon/engine';
import { normalizeProfile } from '../../lib/profile';
const env={isRendered:()=>true,assignFiles:()=>{}};
it.each([
 ['United States','Are you legally authorized to work in the United States?',true],
 ['United States','Are you legally authorized to work in Canada?',false],
 ['United States','Are you legally authorized to work in the United States or Canada?',false],
 ['','Are you legally authorized to work?',false],
 ['United States','Are you legally authorized to work?',true],
 ['United States','Will you require visa sponsorship in Canada?',false],
] as const)('saved eligibility answers stay in their saved country: %s / %s',(country,question,expected)=>{
 document.body.innerHTML=`<form><label>First name<input></label><label>Email<input></label><label>Phone<input></label><label>${question}<select><option value="">Select</option><option>Yes</option><option>No</option></select></label><button>Submit</button></form>`;
 const scan=scanNative(document,env);
 const rows=planNative([{frameId:0,documentId:'doc',scan}],normalizeProfile({country,firstName:'Ada',email:'ada@example.com',phone:'555-0100',workAuthorization:'yes',sponsorship:'no'}));
 expect(!!rows.find(row=>row.field.descriptor.control==='select')?.action).toBe(expected);
});
