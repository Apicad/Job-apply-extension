/** Stable across Chrome storage's object-key reordering; arrays remain ordered. */
export function stableKey(value: unknown): string {
 return JSON.stringify(value, (_name, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
}
