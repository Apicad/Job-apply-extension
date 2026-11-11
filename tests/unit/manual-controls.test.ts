import { beforeEach, expect, it, vi } from 'vitest';
import { collectManualControls } from '../../lib/page/manual-controls';
import { manualControlViews, sanitizeManualControls } from '../../lib/hackathon/manual-controls';

const env = { isRendered: (el: Element) => !el.hasAttribute('data-invisible'), assignFiles: () => {} };
beforeEach(() => { document.body.innerHTML = '<form id="application"></form>'; });
function add(markup: string) { document.querySelector('form')!.insertAdjacentHTML('beforeend', markup); }

it('reports required ARIA dropdown, checkbox and radio question without events or selected values', () => {
  add('<span id="department-label">Department</span><button type="button" role="combobox" aria-haspopup="listbox" aria-required="true" aria-labelledby="department-label">Choose...</button><div role="checkbox" aria-label="Application data consent" aria-checked="false" aria-required="true" tabindex="0"></div><div role="radiogroup" aria-label="Available schedule" aria-required="true"><div role="radio" aria-checked="false">Morning</div><div role="radio" aria-checked="true">Evening</div></div>');
  const event = vi.fn(); for (const name of ['click','input','change']) document.addEventListener(name,event);
  expect(collectManualControls(document, env)).toEqual([
    {id:'manual-0',form:0,label:'Department',kind:'combobox',required:true},
    {id:'manual-1',form:0,label:'Application data consent',kind:'checkbox',required:true},
    {id:'manual-2',form:0,label:'Available schedule',kind:'radio',required:true},
  ]);
  expect(event).not.toHaveBeenCalled(); expect(document.querySelector('[aria-checked="true"]')?.textContent).toBe('Evening');
});

it('does not duplicate native control skins or controller-linked option popups', () => {
  add('<div role="combobox"><input role="combobox" aria-label="City"></div><div role="checkbox"><input type="checkbox"></div><div role="radiogroup"><input type="radio" name="native"></div><label><input type="checkbox"><span role="checkbox">Native skin</span></label><button type="button" aria-haspopup="listbox" aria-controls="menu" aria-label="Department">Select</button><div role="listbox" id="menu"><div role="option">Engineering</div><div role="checkbox" aria-label="Dropdown option"></div></div><input role="combobox" aria-controls="native-menu" aria-label="Native city"><div role="listbox" id="native-menu"><div role="option">London</div></div>');
  expect(collectManualControls(document, env).map(x=>x.label)).toEqual(['Department']);
});

it('ignores hidden required helpers when observing custom controls and deduplicates real shadow-backed controls', () => {
  add('<div role="combobox" aria-label="Custom city"><input aria-hidden="true" tabindex="-1" required></div><button type="button" role="combobox" aria-label="Custom country"><input hidden required></button><div role="combobox" aria-label="Shadow-backed" id="backed"></div>');
  document.querySelector('#backed')!.attachShadow({mode:'open'}).innerHTML='<input role="combobox" aria-label="Native city">';
  expect(collectManualControls(document, env).map(x=>x.label)).toEqual(['Custom city','Custom country']);
});

it('observes standalone listboxes and hidden-input-backed custom dropdowns', () => {
  add('<label for="list">Languages</label><div id="list" role="listbox" aria-multiselectable="true"><div role="option">English</div></div><div><input type="hidden" value="stored"><button type="button" aria-haspopup="listbox" aria-label="Department">Engineering</button></div>');
  expect(collectManualControls(document, env).map(x=>[x.kind,x.label])).toEqual([['combobox','Languages'],['combobox','Department']]);
});

it('omits hidden, inert, search, SVG and sign-in controls but reports visible disabled controls', () => {
  add('<div hidden><div role="checkbox" aria-label="Hidden"></div></div><div inert><button aria-haspopup="listbox" aria-label="Inert"></button></div><div role="search"><div role="checkbox" aria-label="Search"></div></div><div role="checkbox" aria-hidden="true" aria-label="Aria hidden"></div><div role="checkbox" data-invisible aria-label="CSS hidden"></div><button type="button" disabled aria-haspopup="listbox" aria-label="Disabled choice"></button><svg><g role="checkbox" aria-label="SVG"></g></svg>');
  document.body.insertAdjacentHTML('beforeend','<form><input type="password"><div role="checkbox" aria-label="Remember me"></div></form>');
  expect(collectManualControls(document, env).map(x=>x.label)).toEqual(['Disabled choice']);
});

it('groups checkbox options by their own question without merging different questions', () => {
  add('<fieldset aria-required="true"><legend>Preferred locations</legend><div role="checkbox">North</div><div role="checkbox">South</div><div hidden role="checkbox">Hidden</div></fieldset><fieldset><legend>Other question</legend><div role="checkbox">One</div><div role="checkbox">Two</div></fieldset>');
  expect(collectManualControls(document, env).map(x=>[x.kind,x.label,x.required])).toEqual([['checkbox','Preferred locations',true],['checkbox','Other question',false]]);
});

it('keeps form and shadow-root ownership aligned with native form numbering', () => {
  add('<div role="checkbox" aria-label="Application"></div><div id="shadow"></div>');
  document.body.insertAdjacentHTML('beforeend','<form id="other"><div role="checkbox" aria-label="Other"></div></form><button type="button" form="other" aria-haspopup="listbox" aria-label="Associated"></button>');
  const shadow = document.querySelector('#shadow')!.attachShadow({mode:'open'});
  shadow.innerHTML='<div role="checkbox" aria-label="Formless shadow"></div>';
  const form = document.createElement('form'); form.innerHTML='<div role="checkbox" aria-label="Shadow form"></div>'; shadow.append(form);
  expect(collectManualControls(document, env).map(x=>[x.label,x.form])).toEqual([['Application',0],['Formless shadow',-1],['Shadow form',2],['Other',1],['Associated',1]]);
});

it('does not borrow neighboring values when a control has no accessible label', () => {
  add('<button type="button" aria-haspopup="listbox">Selected private answer</button><div role="radiogroup"><div role="radio">Secret option</div></div><div role="checkbox"></div>');
  expect(collectManualControls(document, env).map(x=>x.label)).toEqual(['Custom dropdown','Radio question','Checkbox question']);
});

it('bounds and sanitizes observation payloads and rejects malformed or writable shapes', () => {
  const item={id:'manual-0',form:0,label:'  Question\u202e\n text  ',kind:'checkbox',required:false};
  expect(sanitizeManualControls([item])).toEqual([{...item,label:'Question text'}]);
  expect(sanitizeManualControls(undefined)).toEqual([]);
  expect(sanitizeManualControls([{...item,label:'x'.repeat(2000)}])?.[0]?.label).toHaveLength(1000);
  for(const value of [null,{},[null],[{...item,ref:2}],[{...item,form:-2}],[{...item,kind:'text'}],[{...item,required:'true'}],[item,item],[Object.create({id:'manual-0'})]]) expect(sanitizeManualControls(value)).toBeNull();
  const accessor=Object.defineProperty({...item},'label',{get(){throw Error('should not read')}});
  expect(sanitizeManualControls([accessor])).toBeNull();
  expect(sanitizeManualControls(Array.from({length:110},(_,i)=>({...item,id:`manual-${i}`})))).toHaveLength(100);
});

it('exposes only manual review rows, including already chosen widgets', () => {
  const items=collectManualControls(document, env); expect(items).toEqual([]);
  const views=manualControlViews([{id:'manual-0',form:0,label:'Consent',kind:'checkbox',required:true,documentId:'doc'}]);
  expect(views).toEqual([{id:'manual:["doc","manual-0"]',label:'Consent',status:'review',detail:'Review this checkbox question on the application. It is not filled automatically.'}]);
});
