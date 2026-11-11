import type { Profile } from '../types';
import type { Fact } from '../hackathon/contracts';

export interface SidebarField {
  id: string;
  label: string;
  status: 'filled' | 'kept' | 'review' | 'failed';
  detail?: string;
}

export interface SidebarDraft {
  id: string;
  revision: number;
  question: string;
  text: string;
  sources: Fact[];
  gaps: string[];
  status: 'review' | 'filled' | 'failed';
}

export interface SidebarRun {
  id: string;
  tabId: number;
  url: string;
  phase: 'scanning' | 'filling' | 'drafting' | 'review' | 'finished' | 'cancelled' | 'error';
  message: string;
  job: { title: string; company: string };
  fields: SidebarField[];
  drafts: SidebarDraft[];
}

export interface SidebarState {
  profile: Profile;
  facts: Fact[];
  resume: { name: string } | null;
  run: SidebarRun | null;
  aiEnabled: boolean;
}
