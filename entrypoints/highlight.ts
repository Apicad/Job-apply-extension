import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {highlightQuestion} from '../lib/sidebar/question-highlight';
import {browserEnv} from '../lib/page/layout';
export default defineUnlistedScript(()=>{
 const world=globalThis as typeof globalThis & {__jaaHighlight?:{url:string;label:string}};
 const request=world.__jaaHighlight;delete world.__jaaHighlight;
 return !!request&&highlightQuestion(document,browserEnv,request.url,request.label);
});
