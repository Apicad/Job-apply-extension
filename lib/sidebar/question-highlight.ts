import {collectControls} from '../page/collect';
import {describeControl} from '../page/describe';
import {isShown} from '../page/visibility';
import type {PageEnv} from '../types';
/** Read-only navigation aid: no focus, clicks, input events or changes to answers. */
export function highlightQuestion(doc:Document,env:PageEnv,url:string,label:string):boolean {
 if(doc.location.href!==url || !label.trim())return false;
 const clean=(s:string)=>s.replace(/[✱*]/g,'').replace(/\s+/g,' ').trim();
 let matches:HTMLElement[]=collectControls(doc).filter(c=>isShown(c,env)&&clean(describeControl(c).label)===clean(label)).map(c=>c.control==='radio'?c.radios[0]!:c.el);
 if(!matches.length){
  const walk=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let node:Node|null;
  while((node=walk.nextNode())){const el=node.parentElement;if(el&&clean(el.textContent??'')===clean(label)&&!el.closest('script,style,[hidden],[inert],[aria-hidden="true"]')&&env.isRendered(el))matches.push(el);}
 }
 matches=[...new Set(matches)];if(matches.length!==1)return false;
 const target=matches[0]!;const outline=target.style.outline,offset=target.style.outlineOffset;
 target.style.outline='4px solid #b65b00';target.style.outlineOffset='5px';
 target.scrollIntoView({block:'center',behavior:'smooth'});
 setTimeout(()=>{target.style.outline=outline;target.style.outlineOffset=offset;},15000);
 return true;
}
