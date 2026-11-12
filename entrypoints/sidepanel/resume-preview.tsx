import React,{useEffect,useRef,useState} from 'react';
import {isStoredResume,resumeToFile} from '../../lib/resume';
import type {StoredResume} from '../../lib/types';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export function SidebarResumePreview({name,load}:{name:string|null;load:()=>Promise<unknown>}){
 const [open,setOpen]=useState(false),[resume,setResume]=useState<StoredResume|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [page,setPage]=useState(1),[pages,setPages]=useState(0),[ready,setReady]=useState(false),[text,setText]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null);const version=useRef(0);
 useEffect(()=>{version.current++;setResume(null);setOpen(false);setPage(1);setError('');setLoading(false);},[name]);
 useEffect(()=>{
  if(!open||!resume)return;let cancelled=false;let destroy:(()=>Promise<void>)|undefined;
  setReady(false);setError('');setText('');
  void(async()=>{try{
   const file=resumeToFile(resume);
   if(file.type==='text/plain'){const value=await file.text();if(!cancelled){setText(value);setReady(true);}return;}
   if(file.type!=='application/pdf'){if(!cancelled)setError('Inline preview supports PDF and text résumés. Open Profile home to view your general résumé or replace the attachment with a PDF.');return;}
   const pdfjs=await import('pdfjs-dist');if(cancelled)return;pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
   const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWorkerFetch:false,useWasm:false,disableFontFace:true,useSystemFonts:true,enableXfa:false,verbosity:0});
   destroy=()=>task.destroy();if(cancelled){await destroy();return;}
   const pdf=await task.promise;if(cancelled)return;
   if(pdf.numPages>20)throw Error('Preview supports PDFs up to 20 pages.');
   setPages(pdf.numPages);const sheet=await pdf.getPage(page);if(cancelled||!canvas.current)return;
   const viewport=sheet.getViewport({scale:1.5});const target=canvas.current;
   if(viewport.width*viewport.height>16000000)throw Error('This PDF page is too large to preview.');
   target.width=viewport.width;target.height=viewport.height;
   await sheet.render({canvas:target,viewport}).promise;if(!cancelled)setReady(true);
  }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Could not preview the résumé.');}})();
  return()=>{cancelled=true;void destroy?.();};
 },[open,resume,page]);
 async function show(){const request=++version.current;setLoading(true);setError('');try{
  const result=await load() as {resume?:unknown};if(request!==version.current)return;
  if(!isStoredResume(result.resume))throw Error('No valid résumé is saved. Add one in Profile home.');
  setResume(result.resume);setPage(1);setOpen(true);
 }catch(e){if(request===version.current)setError(e instanceof Error?e.message:'Could not load résumé.');}finally{if(request===version.current)setLoading(false);}}
 return <section className="sidebar-resume" aria-label="Saved résumé preview">
  <h2>Your application résumé</h2><p className="helper">{name||'No résumé attached yet'}</p>
  <button className="secondary full" disabled={loading||!name} onClick={()=>open?setOpen(false):void show()}>{loading?'Opening résumé…':open?'Hide résumé preview':'Preview résumé'}</button>
  {open&&<><p className="helper">The saved attachment used by Autofill. This preview does not upload or change it.</p>
   {!ready&&!error&&<p role="status">Rendering résumé…</p>}
   {resume?.type==='application/pdf'&&<><div className="resume-page-controls"><button disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Previous page</button><span>Page {page} of {pages||'…'}</span><button disabled={page>=pages} onClick={()=>setPage(n=>n+1)}>Next page</button></div><canvas ref={canvas} aria-label={`Résumé page ${page}`} style={{display:ready?'block':'none'}}/></>}
   {text&&<pre>{text}</pre>}{ready&&<p role="status">Résumé preview ready.</p>}
  </>}
  {error&&<p role="alert" className="inline-error">{error}</p>}
 </section>;
}
