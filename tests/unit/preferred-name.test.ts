import { beforeEach, expect, it } from 'vitest';
import { emptyProfile, isProfileEmpty, normalizeProfile, textValueFor } from '../../lib/profile';
import { classifyField } from '../../lib/classify';
import { pickChoice } from '../../lib/choices';
import { scanNative } from '../../lib/hackathon/page';
import { planNative } from '../../lib/hackathon/engine';
import type { FieldDescriptor } from '../../lib/types';
const field = (label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({ control: 'text', inputType: 'text', label, groupLabel: '', id: '', name: '', hints: '', placeholder: '', autocomplete: '', required: false, options: [], accept: '', ...extra });
beforeEach(() => { document.body.innerHTML = ''; });

it('migrates a legacy profile with preferred name blank, without deriving it', () => {
  const profile = normalizeProfile({ firstName: 'Ada', lastName: 'Lovelace' });
  expect(profile.preferredFirstName).toBe('');
  expect(isProfileEmpty(emptyProfile())).toBe(true);
  expect(isProfileEmpty(normalizeProfile({ preferredFirstName: 'Addie' }))).toBe(false);
  expect(normalizeProfile({ preferredFirstName: '  Addie  ' }).preferredFirstName).toBe('  Addie  ');
  expect(isProfileEmpty(normalizeProfile({ preferredFirstName: '   ' }))).toBe(true);
  for (const preferredFirstName of [null, 9, 'x'.repeat(301)]) expect(normalizeProfile({ preferredFirstName }).preferredFirstName).toBe('');
});
it.each(['Preferred first name', 'Preferred given name', 'Preferred First Name (optional)', 'What is your preferred first name?', 'What is your preferred given name?'])('recognizes the exact question %s', label => {
  expect(classifyField(field(label))).toBe('preferredFirstName');
});
it.each(['Preferred name', 'Nickname', 'Preferred full name', 'Preferred First & Last Name', 'Preferred last name', 'Legal preferred first name', 'If different, preferred first name', 'What do you prefer to be called?', 'Your manager preferred first name'])('leaves the ambiguous or different question manual: %s', label => {
  expect(classifyField(field(label))).toBeNull();
});
it('requires the preferred label and refuses conflicting legal/ordinary name markup', () => {
  expect(classifyField(field('', { name: 'preferred_first_name' }))).toBeNull();
  expect(classifyField(field('Preferred first name', { name: 'preferred_first_name' }))).toBe('preferredFirstName');
  expect(classifyField(field('First name', { name: 'preferred_first_name' }))).toBeNull();
  expect(classifyField(field('Preferred first name', { name: 'first_name' }))).toBeNull();
  expect(classifyField(field('Preferred first name', { groupLabel: 'Legal name' }))).toBeNull();
  expect(classifyField(field('Preferred first name', { groupLabel: 'Name' }))).toBe('preferredFirstName');
  expect(classifyField(field('Preferred first name', { control: 'select' }))).toBeNull();
});
it('keeps legal/ordinary names independent and never falls back for unanswered preferred names', () => {
  const profile = normalizeProfile({ firstName: 'Ada', preferredFirstName: 'Addie', lastName: 'Lovelace' });
  expect(textValueFor('firstName', profile, field('First name'))).toBe('Ada');
  expect(textValueFor('fullName', profile, field('Legal name'))).toBe('Ada Lovelace');
  expect(textValueFor('preferredFirstName', profile, field('Preferred first name'))).toBe('Addie');
  expect(textValueFor('preferredFirstName', { ...profile, preferredFirstName: '  Addie  ' }, field('Preferred first name'))).toBe('Addie');
  expect(textValueFor('preferredFirstName', { ...profile, preferredFirstName: '' }, field('Preferred first name'))).toBe('');
  expect(pickChoice('preferredFirstName', profile, [{ label: 'Addie', value: 'a', disabled: false }])).toEqual({ status: 'noOption' });
});
it('plans the explicit preferred field separately and keeps existing/unknown fields untouched', () => {
  document.body.innerHTML = '<form><label>First name<input></label><label>Full legal name<input></label><label>Email<input></label><label>Phone<input></label><label>Preferred first name<input></label><label>Preferred name<input></label></form>';
  const env = { isRendered: () => true, assignFiles: () => {} };
  const profile = normalizeProfile({ firstName: 'Ada', preferredFirstName: 'Addie', lastName: 'Lovelace', email: 'ada@example.com', phone: '555-0100' });
  const plan = () => planNative([{ documentId: 'preferred-document', frameId: 0, scan: scanNative(document, env) }], profile);
  expect(plan().find(row => row.field.descriptor.label === 'First name')?.action).toMatchObject({ type: 'text', value: 'Ada' });
  expect(plan().find(row => row.field.descriptor.label === 'Full legal name')?.action).toMatchObject({ type: 'text', value: 'Ada Lovelace' });
  expect(plan().find(row => row.field.descriptor.label === 'Preferred first name')?.action).toMatchObject({ type: 'text', value: 'Addie' });
  expect(plan().find(row => row.field.descriptor.label === 'Preferred name')?.action).toBeNull();
  document.querySelectorAll('input')[4]!.value = 'Already entered';
  expect(plan().find(row => row.field.descriptor.label === 'Preferred first name')?.action).toBeNull();
  document.querySelectorAll('input')[4]!.value = '';
  profile.preferredFirstName = '';
  expect(plan().find(row => row.field.descriptor.label === 'Preferred first name')?.action).toBeNull();
});
