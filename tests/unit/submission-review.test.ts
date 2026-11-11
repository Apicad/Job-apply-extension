import { afterEach, expect, test, vi } from 'vitest';
import { revealSubmission } from '../../lib/sidebar/submission-review';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });
function page(html: string) {
  document.body.innerHTML = html;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this as HTMLElement).hidden ? [] as any : [{ width: 120, height: 40 }] as any;
  });
  const scroll = vi.fn(); HTMLElement.prototype.scrollIntoView = scroll;
  return scroll;
}
test('reveals a unique submission control without clicking, focusing, validating or submitting', () => {
  const scroll = page('<form><input required><button>Submit application</button></form>');
  const click = vi.fn(); const submit = vi.fn();
  document.querySelector('button')!.onclick = click;
  document.querySelector('form')!.onsubmit = submit;
  const focus = document.activeElement;
  expect(revealSubmission(location.href)).toEqual({ found: true });
  expect(scroll).toHaveBeenCalledOnce(); expect(click).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(focus);
});
test('refuses changed URLs and ambiguous controls', () => {
  const scroll = page('<button>Submit application</button><button>Send application</button>');
  expect(revealSubmission(location.href)).toEqual({ found: false });
  expect(revealSubmission('https://different.example/apply')).toEqual({ found: false });
  expect(scroll).not.toHaveBeenCalled();
});
test('ignores hidden and unrelated controls and supports disabled submission buttons', () => {
  const scroll = page('<button hidden>Submit application</button><button>Subscribe</button><input disabled type="submit" value="Submit application">');
  expect(revealSubmission(location.href)).toEqual({ found: true }); expect(scroll).toHaveBeenCalledOnce();
});
