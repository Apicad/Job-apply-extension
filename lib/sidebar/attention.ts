import type { SidebarDraft, SidebarField } from './ui-types';

/** An AI draft can replace its writing-field row, never a manual control or checkbox question. */
export function visibleAttentionFields(pending: SidebarField[], drafts: Pick<SidebarDraft, 'question'>[]): SidebarField[] {
  return pending.filter(field => field.id.startsWith('checkbox:') || field.id.startsWith('manual:') || !drafts.some(draft => draft.question === field.label));
}
