import type { Fact, Segment } from '../hackathon/contracts';
export interface MaterialsBrief { role: string; company: string; jobDescription: string; careerDirection: string; tone: 'natural' | 'concise' | 'confident' }
export interface MaterialsEntry { id: string; revision: number; heading: string; detail?: string; date?: string; lines: string[]; section: 'experience' | 'projects' }
export interface MaterialsRequest { schema: 1; kind: 'materials'; id: string; expiresAt: number; sourceKey: string; brief: MaterialsBrief; entries: MaterialsEntry[]; evidence: Fact[] }
export interface MaterialsReplyWire { schema: 1; kind: 'materials'; requestId: string; sourceKey: string; expiresAt: number; summary: Segment[]; entries: Array<{ entryId: string; bullets: Segment[] }>; coverLetter: Segment[]; missing: string[] }
export interface MaterialsReply extends MaterialsReplyWire { warnings: string[] }
