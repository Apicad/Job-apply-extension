import type { SidebarField } from '../sidebar/ui-types';

/** Display-only semantic controls. No ref, writable descriptor, answer or selected value. */
export interface ManualControl {
  id: string;
  form: number;
  label: string;
  kind: 'combobox' | 'checkbox' | 'radio';
  required: boolean;
}
export interface ApplicationManualControl extends ManualControl { documentId: string }
const KINDS = new Set(['combobox', 'checkbox', 'radio']);
const KEYS = ['id', 'form', 'label', 'kind', 'required'];
const invisible = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u200b\u2060\ufeff\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
function cleanLabel(value: string): string {
  const text = value.replace(invisible, '').replace(/\s+/g, ' ').trim();
  return text.slice(0, /[\ud800-\udbff]/.test(text.charAt(999)) ? 999 : 1000).trimEnd();
}

/** Validate separately from writable fields; old scans need not contain observations. */
export function sanitizeManualControls(value: unknown): ManualControl[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: ManualControl[] = []; const ids = new Set<string>();
  try {
    for (const raw of value.slice(0, 100)) {
      if (!raw || typeof raw !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
      const descriptors = Object.getOwnPropertyDescriptors(raw);
      if (Reflect.ownKeys(raw).length !== KEYS.length || !KEYS.every(key => descriptors[key] && Object.hasOwn(descriptors[key]!, 'value'))) return null;
      const item = raw as Record<string, unknown>;
      if (typeof item.id !== 'string' || !/^manual-\d{1,5}$/.test(item.id) || ids.has(item.id) ||
        !Number.isSafeInteger(item.form) || Number(item.form) < -1 || typeof item.label !== 'string' ||
        typeof item.kind !== 'string' || !KINDS.has(item.kind) || typeof item.required !== 'boolean') return null;
      ids.add(item.id);
      result.push({ id: item.id, form: Number(item.form), label: cleanLabel(item.label) || 'Application question', kind: item.kind as ManualControl['kind'], required: item.required });
    }
  } catch { return null; }
  return result;
}

export function manualControlViews(items: readonly ApplicationManualControl[]): SidebarField[] {
  return items.map(item => ({ id: `manual:${JSON.stringify([item.documentId, item.id])}`, label: item.label, status: 'review',
    detail: `Review this ${item.kind === 'combobox' ? 'custom dropdown' : `${item.kind} question`} on the application. It is not filled automatically.` }));
}
