import type { SidebarField } from '../sidebar/ui-types';

/** Display-only observations. No ref, selected values, or writable descriptor is retained. */
export interface CheckboxGroup {
  id: string;
  form: number;
  label: string;
  required: boolean;
  optionCount: number;
  checkedCount: number;
}
export interface ApplicationCheckboxGroup extends CheckboxGroup { documentId: string }
const MAX_GROUPS = 100;
const MAX_OPTIONS = 2000;
const invisible = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u200b\u2060\ufeff\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
function label(value: string): string {
  const text = value.replace(invisible, '').replace(/\s+/g, ' ').trim();
  const limit = /[\ud800-\udbff]/.test(text.charAt(999)) ? 999 : 1000;
  return text.slice(0, limit).trimEnd();
}

/** Page data is bounded and validated independently of writable field descriptors. */
export function sanitizeCheckboxGroups(value: unknown): CheckboxGroup[] | null {
  if (value === undefined) return []; // Stored plans and old scans remain readable.
  if (!Array.isArray(value)) return null;
  const groups: CheckboxGroup[] = [];
  const ids = new Set<string>();
  for (const raw of value.slice(0, MAX_GROUPS)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const g = raw as Record<string, unknown>;
    if (typeof g.id !== 'string' || !/^checkbox-\d{1,5}$/.test(g.id) || ids.has(g.id) ||
      !Number.isSafeInteger(g.form) || Number(g.form) < -1 || typeof g.label !== 'string' ||
      typeof g.required !== 'boolean' || !Number.isSafeInteger(g.optionCount) || Number(g.optionCount) < 1 || Number(g.optionCount) > MAX_OPTIONS ||
      !Number.isSafeInteger(g.checkedCount) || Number(g.checkedCount) < 0 || Number(g.checkedCount) > Number(g.optionCount)) return null;
    ids.add(g.id);
    groups.push({ id: g.id, form: Number(g.form), label: label(g.label) || 'Checkbox group', required: g.required,
      optionCount: Number(g.optionCount), checkedCount: Number(g.checkedCount) });
  }
  return groups;
}

export function checkboxGroupViews(groups: readonly ApplicationCheckboxGroup[]): SidebarField[] {
  return groups.map(group => ({ id: `checkbox:${JSON.stringify([group.documentId, group.id])}`, label: group.label, status: 'review',
    detail: group.checkedCount > 0
      ? 'Review your checkbox selections on the application. They were not changed.'
      : 'Choose your checkbox answers on the application. These are not filled automatically.' }));
}
