import type { FieldKind } from '../types';
export type WritingIntent = 'motivation' | 'project' | 'skills' | 'work-style';
/** Fast local routing, not another model call. Unknown questions remain manual. */
export function writingIntent(label: string): WritingIntent | null {
 const q = label.trim().replace(/[’]/g, "'").replace(/[.!?✱*]+$/, '').trim();
 if (/^(describe a relevant project|tell us about a project you built|tell us about the software project you're most proud of that you built from scratch)$/i.test(q)) return 'project';
 if (/^why are you (?:excited about|interested in) [\p{L}\p{N} &'-]{1,100}$/iu.test(q)) return 'motivation';
 if (/^what languages, frameworks, and tools are you proficient in\? approximately how many years of experience have you had with each$/i.test(q)) return 'skills';
 if (/^are you more of a perfectionist who values the best solution or more of a hacker who values shipping things quickly\? we know the world is gray, not black and white, but what's your baseline tendency$/i.test(q)) return 'work-style';
 return null;
}
export function missingFieldDetail(kind: FieldKind | null, label: string): string {
 if (kind === 'currentCompany') return 'Save your current company in Profile home if currently employed. If not, leave an optional field blank or enter the employer’s accepted answer. A past employer is not automatically your current company.';
 if (kind === 'resume') return 'Add a résumé in Profile home, then retry Autofill. If one is saved, check the upload format on the application.';
 if (kind) return 'Check this saved detail in Profile home. If it is already saved, choose the matching option on the application; this control may need a manual selection.';
 if (/github|gitlab|project.*links|links.*project/i.test(label)) return 'Use your saved GitHub or project links. This combined question needs a manual answer for now.';
 return 'This question is not recognized yet. Answer it on the application; no value was guessed.';
}
