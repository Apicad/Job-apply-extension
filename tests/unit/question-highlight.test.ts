import {it,expect,vi,afterEach} from 'vitest';
import {highlightQuestion} from '../../lib/sidebar/question-highlight';
const env={isRendered:()=>true,assignFiles:()=>{}};
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();vi.useRealTimers();});
it('locates and highlights the exact question without changing its value or activating it',()=>{
 vi.useFakeTimers(); document.body.innerHTML='<form><label>Where are you located?<input value="Saved city"></label><button>Submit</button></form>';
 const scroll=vi.fn(); HTMLElement.prototype.scrollIntoView=scroll;
 const input=document.querySelector('input')!; const click=vi.fn();input.onclick=click;
 expect(highlightQuestion(document,env,location.href,'Where are you located?')).toBe(true);
 expect(input.style.outline).toContain('solid');expect(input.value).toBe('Saved city');expect(click).not.toHaveBeenCalled();
 vi.runAllTimers();expect(input.style.outline).toBe('');
});
it('refuses changed pages and duplicate labels',()=>{
 document.body.innerHTML='<label>Question<textarea></textarea></label><label>Question<textarea></textarea></label>';
 expect(highlightQuestion(document,env,'https://other.example','Question')).toBe(false);
 expect(highlightQuestion(document,env,location.href,'Question')).toBe(false);
});
