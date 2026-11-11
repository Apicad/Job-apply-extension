import { describe, expect, it } from 'vitest';
import { greenhouseAction } from '../../lib/hackathon/greenhouse-plan';
import { planNative, type Frame } from '../../lib/hackathon/engine';
import { normalizeProfile } from '../../lib/profile';
import type { NativeField } from '../../lib/hackathon/page';
import type { FieldDescriptor } from '../../lib/types';
const url='https://job-boards.greenhouse.io/embed/job_app?for=fictional&token=123';
const profile=normalizeProfile({firstName:'Ada',email:'ada@example.com',phone:'(415) 555-0100',country:'United States',city:'San Francisco',state:'California',school:'Example College',degree:'Associate of Science',major:'Computer Science',graduationDate:'2027-06'});
function field(ref:number,label:string,id:string,patch:Partial<FieldDescriptor>={},extra:Partial<NativeField>={}):NativeField { return {ref,form:0,empty:true,maxLength:-1,descriptor:{control:'combobox',inputType:'text',autocomplete:'',label,groupLabel:'',name:'',id,placeholder:'',hints:'',required:false,options:[],accept:'',...patch},...extra}; }
function frame(fields:NativeField[],at=url):Frame {return {frameId:0,documentId:'doc',scan:{scanId:'scan',url:at,shown:true,job:{title:'Intern',company:'Fictional'},fields}};}
const school=()=>field(1,'School','school--0');
const fields=()=>[field(0,'Resume/CV','resume',{control:'file',inputType:'file'}),school(),field(2,'Degree','degree--0'),field(3,'Discipline','discipline--0'),field(4,'End date month','end-date-month--0'),field(5,'End date year','end-date-year--0',{control:'text',inputType:'number'})];
function planned(list=fields(),p=profile,at=url) {return planNative([frame(list,at)],p).filter(row=>row.action).map(row=>({id:row.field.descriptor.id,action:row.action}));}

describe('Greenhouse planner',()=>{
 it('fills saved education without inventing dates or degree text',()=>{
  const result=planned();expect(result.map(r=>r.id)).toEqual(['school--0','degree--0','discipline--0','end-date-month--0','end-date-year--0']);
  expect(result[3]?.action).toMatchObject({type:'combobox',target:{kind:'graduationDate',value:'June'}});expect(result[4]?.action).toMatchObject({type:'text',value:'2027'});
 });
 it('requires a saved school before planning dependent education',()=>{
  expect(planned(fields(),{...profile,school:''})).toEqual([]);
 });
 it('binds every dependent education action to the exact planned school',()=>{
  const result=planned();expect(result[0]?.action).not.toHaveProperty('education');
  for (const entry of result.slice(1)) expect(entry.action).toMatchObject({education:{schoolRef:1,value:'Example College',signature:expect.any(String)}});
 });
 it('leaves unsaved degree and graduation date unanswered',()=>{
  expect(planned(fields(),{...profile,degree:'',graduationDate:''}).map(r=>r.id)).toEqual(['school--0','discipline--0']);
 });
 it.each(['https://greenhouse.io.evil.example/jobs','https://evil.example/?to=greenhouse.io','https://job-boards.greenhouse.io@evil.example/jobs','file:///greenhouse.io/form','http://localhost/greenhouse-live.html'])('has no production adapter exception for %s',at=>{
  const f=school();expect(greenhouseAction(f,[f],at,profile,'signature')).toBeNull();
 });
 it.each(['End date month for your last employer','End date month — I certify','Start date month','Date of birth'])('does not fill a disguised date label: %s',text=>{
  const list=fields();list[4]!.descriptor.label=text;expect(planned(list).some(r=>r.id==='end-date-month--0')).toBe(false);
 });
 it('requires a school from the same form and matching row',()=>{
  const list=fields();list[1]!.form=7;expect(planned(list).some(r=>['end-date-month--0','end-date-year--0','discipline--0'].includes(r.id))).toBe(false);
 });
 it('does not attach saved dates or degree to an existing unverified school selection',()=>{
  const list=fields();list[1]!.empty=false;expect(planned(list)).toEqual([]);
 });
 it('binds all educational fields to the first empty school row',()=>{
  const list=fields();list.push(field(6,'School','school--1'),field(7,'Degree','degree--1'),field(8,'End date month','end-date-month--1'));
  list[1]!.empty=false;expect(planned(list).map(r=>r.id)).toEqual(['school--1','degree--1','end-date-month--1']);
 });
 it('does not mix repeated education rows even if their fields are interleaved',()=>{
  const list=fields();list.splice(2,0,field(6,'End date month','end-date-month--1'));list.push(field(7,'School','school--1'));
  expect(planned(list).filter(r=>r.id.startsWith('end-date-month')).map(r=>r.id)).toEqual(['end-date-month--0']);
 });
 it('keeps unsupported dates when the field says employment',()=>{
  const list=fields();list[4]!.descriptor.groupLabel='Employment';list[5]!.descriptor.groupLabel='Employment';expect(planned(list).some(r=>r.id.startsWith('end-date'))).toBe(false);
 });
 it('never plans safety-tail fields even under a valid school row',()=>{
  const list=fields();list[4]!.descriptor.placeholder='Acknowledge and certify';expect(planned(list).some(r=>r.id==='end-date-month--0')).toBe(false);
 });
 it('does not fill overlong year fields',()=>{
  const list=fields();list[5]!.maxLength=3;expect(planned(list).some(r=>r.id==='end-date-year--0')).toBe(false);
 });
 it('selects only one eligible application form and one field per kind',()=>{
  const list=fields();list.push(field(10,'School','other-school',{}, {form:1}),field(11,'School','repeat-school'));
  expect(planned(list).filter(r=>r.action?.type==='combobox'&&r.action.target.kind==='school').map(r=>r.id)).toEqual(['school--0']);
 });
 it('requires all three location components',()=>{
  const f=field(0,'Location (City)','candidate-location');expect(greenhouseAction(f,[f],url,{...profile,state:''},'signature')).toBeNull();
  expect(greenhouseAction(f,[f],url,profile,'signature')?.action).toMatchObject({type:'combobox',target:{kind:'location',value:'San Francisco, California, United States'}});
 });
 it.each(['(415) 555-0100','+1 (415) 555-0100','1 415 555 0100'])('uses explicit valid North American phone shape: %s',phone=>{
  const f=field(0,'Country','country',{groupLabel:'Phone'});expect(greenhouseAction(f,[f],url,{...profile,phone},'signature')?.action).toMatchObject({type:'combobox',target:{kind:'phoneCountry',value:'United States',dialCode:'+1'}});
 });
 it.each(['+44 20 7946 0100','+4155550100','4155550100 ext 12','12345','0155550100'])('does not infer phone country from unsupported phone: %s',phone=>{
  const f=field(0,'Country','country',{groupLabel:'Phone'});expect(greenhouseAction(f,[f],url,{...profile,phone},'signature')).toBeNull();
 });
});
