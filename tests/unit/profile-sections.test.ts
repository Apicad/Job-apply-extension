import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyProfile, normalizeProfile, isProfileEmpty, textValueFor, autofillAllowed } from '../../lib/profile';
import { classifyField } from '../../lib/classify';
import { pickChoice } from '../../lib/choices';
import { scanNative } from '../../lib/hackathon/page';
import { planNative, type NativePlan } from '../../lib/hackathon/engine';
import { greenhouseAction } from '../../lib/hackathon/greenhouse-plan';
import { fillTab } from '../../lib/hackathon/service';
import { key } from '../../lib/hackathon/contracts';
import { saveProfile, loadProfile, writeHackathon } from '../../lib/storage';
import type { FieldDescriptor, Profile, FieldKind } from '../../lib/types';

const env = { isRendered: () => true, assignFiles: () => {} };
const options = (...labels: string[]) => labels.map(label => ({ label, value: label, disabled: false }));
const field = (label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({ control: 'text', inputType: 'text', label, groupLabel: '', id: '', name: '', hints: '', placeholder: '', autocomplete: '', required: false, options: [], accept: '', ...extra });
const populated = () => normalizeProfile({ firstName: 'Ada', email: 'ada@example.com', phone: '555-0100', city: 'Toronto', state: 'Ontario', country: 'Canada', school: 'Example College', degree: 'Diploma', major: 'Computer Science', graduationDate: '2027-05', gpa: '3.5', currentCompany: 'Example Company', currentTitle: 'Developer', workAuthorization: 'yes', sponsorship: 'no', citizenshipCountry: 'United Kingdom', nationality: 'British', usCitizenship: 'no' });

beforeEach(() => { fakeBrowser.reset(); document.body.innerHTML = ''; });
afterEach(() => vi.restoreAllMocks());

it('migrates old profiles with enabled sections and unanswered citizenship, without deriving sensitive facts', () => {
  const profile = normalizeProfile({ country: 'United States', race: 'hispanic', workAuthorization: 'yes' });
  expect([profile.citizenshipCountry, profile.nationality, profile.usCitizenship]).toEqual(['', '', '']);
  expect([profile.fillLocation, profile.fillEducation, profile.fillEmployment, profile.fillEligibility]).toEqual(['yes', 'yes', 'yes', 'yes']);
  expect(isProfileEmpty(emptyProfile())).toBe(true);
  expect(isProfileEmpty(normalizeProfile({ fillEducation: 'no', fillLocation: 'no' }))).toBe(true);
});

it('retains saved values while sections are disabled, including through storage', async () => {
  const profile = { ...populated(), fillLocation: 'no', fillEducation: 'no', fillEmployment: 'no', fillEligibility: 'no' } as Profile;
  await saveProfile(profile);
  expect(await loadProfile()).toEqual(profile);
  expect(normalizeProfile({ citizenshipCountry: 'x'.repeat(301), nationality: 7, usCitizenship: true })).toEqual(emptyProfile());
});

it.each([
  ['Country of citizenship', 'citizenshipCountry'], ['Citizenship country', 'citizenshipCountry'], ['What is your country of citizenship?', 'citizenshipCountry'],
  ['Nationality', 'nationality'], ['What is your nationality?', 'nationality'],
  ['Are you a U.S. citizen?', 'usCitizenship'], ['Are you a United States citizen?', 'usCitizenship'], ['Are you a citizen of the United States?', 'usCitizenship'],
] as const)('recognizes only the explicit supported question: %s', (label, kind) => {
  const d = field(label, kind === 'usCitizenship' ? { control: 'select', inputType: '', options: options('Select...', 'Yes', 'No') } : {});
  expect(classifyField(d)).toBe(kind);
});

it.each([
  'Citizenship', 'Citizenship Status', 'Are you a citizen?', 'Are you a Canadian citizen?',
  'Are you a US citizen or permanent resident?', 'Are you not a US citizen?',
  'Are you a US person for export control purposes?', 'Please confirm you are a U.S. citizen',
  'Are you a U.S. citizen? I certify the above.', 'Are you a U.S. citizen (including lawful residents)?',
  'Country of birth', 'Passport country', 'Your parents nationality', 'Nationality and ethnicity',
  'List all countries of citizenship and dates obtained', 'If yes, what is your nationality?',
])('leaves ambiguous, compound or legally framed questions manual: %s', label => {
  expect(classifyField(field(label, { control: 'select', inputType: '', options: options('Select...', 'Yes', 'No') }))).toBeNull();
});

it.each(['Export controls', 'Sanctions screening', 'Security clearance', 'Consent declaration'])('leaves even a simple citizenship question manual in %s', groupLabel => {
  expect(classifyField(field('Are you a U.S. citizen?', { groupLabel, control: 'radio', inputType: 'radio', options: options('Yes', 'No') }))).toBeNull();
});

it('does not confuse residence country or ethnic identification with citizenship and nationality', () => {
  expect(classifyField(field('Country', { groupLabel: 'Citizenship' }))).toBeNull();
  expect(classifyField(field('Nationality', { name: 'city' }))).toBeNull();
  expect(classifyField(field('', { name: 'nationality' }))).toBeNull();
  expect(classifyField(field('Country of citizenship', { groupLabel: 'Citizenship' }))).toBe('citizenshipCountry');
  const profile = populated();
  expect(textValueFor('citizenshipCountry', profile, field('Country of citizenship'))).toBe('United Kingdom');
  expect(textValueFor('nationality', profile, field('Nationality'))).toBe('British');
  expect(textValueFor('usCitizenship', profile, field('Are you a US citizen?'))).toBe('');
});

it('chooses only unique exact saved nationality/citizenship options and bare US yes/no answers', () => {
  const profile = populated();
  expect(pickChoice('citizenshipCountry', profile, options('Select...', 'Canada', 'United Kingdom'))).toEqual({ status: 'match', index: 2 });
  expect(pickChoice('nationality', profile, options('Select...', 'British', 'Canadian'))).toEqual({ status: 'match', index: 1 });
  expect(pickChoice('nationality', profile, options('British', 'British'))).toEqual({ status: 'noOption' });
  expect(pickChoice('nationality', profile, options('United Kingdom'))).toEqual({ status: 'noOption' });
  expect(pickChoice('usCitizenship', profile, options('Select...', 'Yes', 'No'))).toEqual({ status: 'match', index: 2 });
  for (const list of [options('Yes', 'No, I am a permanent resident'), options('Yes (including residents)', 'No'), options('Yes', 'No', 'Unknown')]) expect(pickChoice('usCitizenship', profile, list)).toEqual({ status: 'noOption' });
  expect(pickChoice('usCitizenship', normalizeProfile({ country: 'United States', workAuthorization: 'yes' }), options('Yes', 'No'))).toEqual({ status: 'missing' });
});

function application() {
  document.body.innerHTML = '<form><label>First name<input></label><label>Email<input></label><label>Phone<input></label><label>City<input></label><label>Country<input></label><label>School<input></label><label>Degree<input></label><label>Current company<input></label><label>Current title<input></label><label>Country of citizenship<input></label><label>Nationality<input></label><label>Are you a U.S. citizen?<select><option value="">Select...</option><option>Yes</option><option>No</option></select></label><label>Are you legally authorized to work in Canada?<select><option value="">Select...</option><option>Yes</option><option>No</option></select></label><label>Are you legally authorized to work in the United States?<select><option value="">Select...</option><option>Yes</option><option>No</option></select></label><label><input type="checkbox">I agree</label></form>';
  const scan = scanNative(document, env);
  return { scan, frames: [{ documentId: 'd', frameId: 0, scan }] };
}

it.each([
  ['fillLocation', ['City', 'Country']], ['fillEducation', ['School', 'Degree']],
  ['fillEmployment', ['Current company', 'Current title']],
  ['fillEligibility', ['Country of citizenship', 'Nationality', 'Are you a U.S. citizen?', 'Are you legally authorized to work in Canada?']],
] as const)('%s disables only that section while preserving other saved answers', (preference, blocked) => {
  const { frames } = application(); const profile = { ...populated(), [preference]: 'no' };
  const rows = planNative(frames, profile);
  for (const label of blocked) expect(rows.find(row => row.field.descriptor.label === label)?.action).toBeNull();
  expect(rows.find(row => row.field.descriptor.label === 'Email')?.action?.type).toBe('text');
  expect(rows.find(row => row.field.descriptor.label === 'Phone')?.action?.type).toBe('text');
  expect(profile.school).toBe('Example College'); expect(profile.country).toBe('Canada');
});

it('keeps eligibility country context when location autofill is off', () => {
  const { frames } = application(); const rows = planNative(frames, { ...populated(), fillLocation: 'no' });
  expect(rows.find(row => row.field.descriptor.label === 'Country')?.action).toBeNull();
  expect(rows.find(row => row.field.descriptor.label === 'Are you legally authorized to work in Canada?')?.action?.type).toBe('select');
  expect(rows.find(row => row.field.descriptor.label === 'Are you legally authorized to work in the United States?')?.action).toBeNull();
});

it('blocks Greenhouse date fragments and phone-country even when generic classification is null', () => {
  const profile = { ...populated(), fillEducation: 'no', fillLocation: 'no' } as Profile;
  for (const d of [field('End date year', { id: 'end-year--0' }), field('Country', { groupLabel: 'Phone', control: 'combobox' })]) {
    expect(autofillAllowed(profile, classifyField(d), d)).toBe(false);
    expect(greenhouseAction({ ref: 1, form: 0, descriptor: d, empty: true, maxLength: -1 }, [], 'https://job-boards.greenhouse.io/example', profile, 'signature')).toBeNull();
  }
});

it.each(['fillLocation', 'fillEducation', 'fillEmployment', 'fillEligibility'] as const)('rechecks %s at execution even if a saved plan contains an action', async preference => {
  const { frames, scan } = application(); const on = populated();
  const rows = planNative(frames, on);
  const wanted: Record<typeof preference, FieldKind> = { fillLocation: 'country', fillEducation: 'school', fillEmployment: 'currentCompany', fillEligibility: 'nationality' };
  const row = rows.find(row => classifyField(row.field.descriptor) === wanted[preference])!;
  expect(row.action).not.toBeNull();
  const off = { ...on, [preference]: 'no' };
  await saveProfile(off);
  const plan: NativePlan = { id: 'forged-plan', tabId: 44, url: scan.url, rows: [row], profileKey: key(off), state: 'preview' };
  await writeHackathon('plan:44', plan, true);
  vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: 44, url: scan.url } as never);
  const execute = vi.spyOn(browser.scripting, 'executeScript');
  await expect(fillTab(44, plan.id)).rejects.toThrow('disabled for this section');
  expect(execute).not.toHaveBeenCalled();
});
