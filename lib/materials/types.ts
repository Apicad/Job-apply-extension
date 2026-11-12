import type { Fact, Source } from '../hackathon/contracts';
export interface MaterialsBrief { role: string; company: string; jobDescription: string; careerDirection: string; tone: 'natural' | 'concise' | 'confident' }
export interface MaterialsEntry { id: string; revision: number; heading: string; detail?: string; date?: string; lines: string[]; section: 'experience' | 'projects' }
export interface MaterialsRequest { schema: 1; kind: 'materials'; id: string; expiresAt: number; sourceKey: string; brief: MaterialsBrief; entries: MaterialsEntry[]; evidence: Fact[] }
/** An optional zero-based line index narrows a citation to one saved statement.
 * Legacy drafts omit it and retain conservative whole-note checks. */
export interface MaterialsSource extends Source { statement?: number }
export interface MaterialsSegment { text: string; sources: MaterialsSource[] }
export interface MaterialsReplyWire { schema: 1; kind: 'materials'; requestId: string; sourceKey: string; expiresAt: number; summary: MaterialsSegment[]; entries: Array<{ entryId: string; bullets: MaterialsSegment[] }>; coverLetter: MaterialsSegment[]; missing: string[] }
export interface MaterialsReply extends MaterialsReplyWire { warnings: string[] }
