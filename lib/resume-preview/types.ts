export type ResumeSectionKey = 'summary' | 'contact' | 'location' | 'links' | 'experience' | 'projects' | 'education' | 'skills';
export type ResumeFactSection = 'experience' | 'projects';
export interface ResumeFactLayout { section: ResumeFactSection; included: boolean }
export interface ResumeLayout {
  sections: Record<ResumeSectionKey, boolean>;
  facts: Record<string, ResumeFactLayout>;
  /** User-entered skills only; nothing is inferred from experience. */
  skills: string;
  summary: string;
  pagePreference: 'one' | 'multiple';
  template: 'classic' | 'professional';
}
export interface ResumeContact { text: string; href?: string }
export interface ResumeEntry {
  id: string;
  heading: string;
  detail?: string;
  date?: string;
  /** Original source lines, including any original bullet markers. */
  lines: string[];
  link?: ResumeContact;
}
export interface ResumeSection {
  key: 'summary' | 'experience' | 'projects' | 'education' | 'skills';
  title: string;
  entries: ResumeEntry[];
}
export interface ResumeDocument {
  template?: 'classic' | 'professional';
  name: string;
  contact: ResumeContact[];
  sections: ResumeSection[];
  warnings: string[];
}
