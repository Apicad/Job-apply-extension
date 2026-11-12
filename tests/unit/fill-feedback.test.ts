import {it, expect, vi} from 'vitest';
import {pulseFilledField} from '../../lib/page/fill-feedback';
it('animates without changing the value or firing input events',()=>{
 const el=document.createElement('input');el.value='Saved answer';const input=vi.fn();el.oninput=input;
 el.animate=vi.fn();pulseFilledField(el);
 expect(el.animate).toHaveBeenCalledOnce();expect(el.value).toBe('Saved answer');expect(input).not.toHaveBeenCalled();
});
it('honors reduced motion and tolerates unsupported animation',()=>{
 const el=document.createElement('input');el.animate=vi.fn();
 const old=window.matchMedia;window.matchMedia=vi.fn(()=>({matches:true}) as MediaQueryList);
 pulseFilledField(el);expect(el.animate).not.toHaveBeenCalled();window.matchMedia=old;
 el.animate=()=>{throw new Error('unsupported');};expect(()=>pulseFilledField(el)).not.toThrow();
});
