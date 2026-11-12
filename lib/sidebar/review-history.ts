import type {SidebarDraft} from './ui-types';
export interface ReviewHistory {url:string;job:{title:string;company:string};drafts:SidebarDraft[]}
/** Retain review notes without replaying answers or granting write approval. */
export function carryReview(history:ReviewHistory|null,url:string,job:ReviewHistory['job']):SidebarDraft[]{
 if(!history||history.url!==url||history.job.title!==job.title||history.job.company!==job.company)return [];
 return structuredClone(history.drafts.filter(d=>d.gaps.length>0||d.resolved));
}
export function mergeReview(drafts:SidebarDraft[],next:SidebarDraft):SidebarDraft[]{
 return [...drafts.filter(d=>d.question!==next.question),next];
}
