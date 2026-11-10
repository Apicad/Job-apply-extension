import { describe, expect, it } from 'vitest';
import { classifyWorkEligibility } from '../../lib/classify';
import { isBackgroundRequest, needsAttention, sanitizeFrameScan, sanitizeOutcomes } from '../../lib/report';
import type { FieldResult, FieldStatus, FillOutcome, FrameScan } from '../../lib/types';

describe('needsAttention', () => {
  const row: FieldResult = {
    ref: 1,
    documentId: 'doc-1',
    kind: 'phone',
    control: 'text',
    label: 'Phone',
    status: 'missing',
    required: false,
    empty: true,
    value: '',
  };

  // The whole truth table: every status, empty or answered, required or not.
  const table: [status: FieldStatus, empty: boolean, required: boolean, want: boolean][] = [
    // We wrote it, will write it, or the user had already answered: nothing left to do.
    ['filled', true, true, false],
    ['filled', true, false, false],
    ['filled', false, true, false],
    ['filled', false, false, false],
    ['fillable', true, true, false],
    ['fillable', true, false, false],
    ['fillable', false, true, false],
    ['fillable', false, false, false],
    ['kept', true, true, false],
    ['kept', true, false, false],
    ['kept', false, true, false],
    ['kept', false, false, false],
    // Recognised but not answered by us: the user has to, while it is still empty.
    ['missing', true, true, true],
    ['missing', true, false, true],
    ['missing', false, true, false],
    ['missing', false, false, false],
    ['noOption', true, true, true],
    ['noOption', true, false, true],
    ['noOption', false, true, false],
    ['noOption', false, false, false],
    ['unsupported', true, true, true],
    ['unsupported', true, false, true],
    ['unsupported', false, true, false],
    ['unsupported', false, false, false],
    ['failed', true, true, true],
    ['failed', true, false, true],
    ['failed', false, true, false],
    ['failed', false, false, false],
    // Not recognised: only worth a mention when the form insists on an answer.
    // Otherwise every optional free-text question would be listed.
    ['unknown', true, true, true],
    ['unknown', true, false, false],
    ['unknown', false, true, false],
    ['unknown', false, false, false],
  ];

  it.each(table)('status %s, empty %s, required %s: %s', (status, empty, required, want) => {
    expect(needsAttention({ ...row, status, empty, required })).toBe(want);
  });
});

describe('isBackgroundRequest', () => {
  const accepted: [name: string, value: unknown][] = [
    ['a scan request', { type: 'scan', tabId: 12 }],
    ['a fill request', { type: 'fill', tabId: 12 }],
    ['tab id 0', { type: 'scan', tabId: 0 }],
    ['a request with members we do not know', { type: 'fill', tabId: 12, sentAt: 1794300000000 }],
  ];

  it.each(accepted)('accepts %s', (_name, value) => {
    expect(isBackgroundRequest(value)).toBe(true);
  });

  const refused: [name: string, value: unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['a string', 'scan'],
    ['a number', 12],
    ['an array', ['scan', 12]],
    ['a request without a tab id', { type: 'scan' }],
    ['a request without a type', { tabId: 12 }],
    ['a type we do not know', { type: 'submit', tabId: 12 }],
    ['a type in the wrong case', { type: 'Scan', tabId: 12 }],
    ['a tab id written as text', { type: 'scan', tabId: '12' }],
    ['a tab id with a fraction', { type: 'scan', tabId: 12.5 }],
    ['a tab id of null', { type: 'scan', tabId: null }],
    ['a tab id of NaN', { type: 'fill', tabId: NaN }],
    ['a tab id of Infinity', { type: 'fill', tabId: Infinity }],
    // chrome.tabs.TAB_ID_NONE: "this is not a browser tab".
    ['a tab id of -1', { type: 'fill', tabId: -1 }],
    ['a tab id too large to be an exact integer', { type: 'fill', tabId: 2 ** 53 }],
  ];

  it.each(refused)('refuses %s', (_name, value) => {
    expect(isBackgroundRequest(value)).toBe(false);
  });
});

describe('sanitizeOutcomes', () => {
  const table: [name: string, value: unknown, want: FillOutcome[]][] = [
    ['null', null, []],
    ['undefined', undefined, []],
    ['an empty object', {}, []],
    ['a string', 'ok', []],
    ['one outcome that is not in a list', { ref: 1, ok: true }, []],
    ['an empty list', [], []],
    [
      'well-formed outcomes, in order',
      [
        { ref: 3, ok: true },
        { ref: 0, ok: false },
      ],
      [
        { ref: 3, ok: true },
        { ref: 0, ok: false },
      ],
    ],
    ['an outcome with extra members', [{ ref: 3, ok: true, value: 'ada@example.com' }], [{ ref: 3, ok: true }]],
    ['entries that are not objects', [null, 7, 'x', [3, true], { ref: 2, ok: true }], [{ ref: 2, ok: true }]],
    ['a ref written as text', [{ ref: '3', ok: true }], []],
    ['a ref with a fraction', [{ ref: 3.5, ok: true }], []],
    ['a ref of NaN', [{ ref: NaN, ok: true }], []],
    ['a missing ref', [{ ok: true }], []],
    ['an "ok" written as text', [{ ref: 3, ok: 'true' }], []],
    ['an "ok" written as a number', [{ ref: 3, ok: 1 }], []],
    ['a missing "ok"', [{ ref: 3 }], []],
  ];

  it.each(table)('%s', (_name, value, want) => {
    expect(sanitizeOutcomes(value)).toEqual(want);
  });

  it('keeps at most 400 outcomes, the first ones', () => {
    const tooMany = Array.from({ length: 450 }, (_, ref) => ({ ref, ok: true }));

    const kept = sanitizeOutcomes(tooMany);

    expect(kept).toHaveLength(400);
    expect(kept[0]).toEqual({ ref: 0, ok: true });
    expect(kept[399]).toEqual({ ref: 399, ok: true });
  });
});

describe('sanitizeFrameScan', () => {
  /**
   * A clean scan in the shape of a Lever application page: an e-mail box, a
   * custom yes/no question and a file input (put outside the form here, so a
   * form index of -1 is covered). A new copy on every call, so a test can
   * break it without touching the others.
   */
  function leverScan(): FrameScan {
    return {
      url: 'https://jobs.lever.co/analyticalengines/6ed76ce8-4156-4b60-b120-403538bd66cd/apply',
      top: true,
      shown: true,
      job: { title: 'Software Engineer', company: 'Analytical Engines' },
      fields: [
        {
          ref: 0,
          form: 0,
          descriptor: {
            control: 'text',
            inputType: 'email',
            autocomplete: 'email',
            label: 'Email',
            groupLabel: '',
            name: 'email',
            id: '',
            placeholder: '',
            hints: 'email-input',
            required: true,
            options: [],
            accept: '',
          },
          empty: true,
        },
        {
          ref: 1,
          form: 0,
          descriptor: {
            control: 'select',
            inputType: '',
            autocomplete: '',
            label: 'Are you legally authorized to work in the United States?',
            groupLabel: '',
            name: 'cards[6ed76ce8-4156-4b60-b120-403538bd66cd][field0]',
            id: '',
            placeholder: '',
            hints: '',
            required: true,
            options: [
              { label: 'Select...', value: '', disabled: false },
              { label: 'Yes', value: 'Yes', disabled: false },
              { label: 'No', value: 'No', disabled: false },
            ],
            accept: '',
          },
          empty: true,
        },
        {
          ref: 2,
          form: -1,
          descriptor: {
            control: 'file',
            inputType: 'file',
            autocomplete: '',
            label: 'Resume/CV',
            groupLabel: '',
            name: 'resume',
            id: 'resume-upload-input',
            placeholder: '',
            hints: 'input-resume',
            required: false,
            options: [],
            accept: '.pdf,.doc,.docx',
          },
          empty: false,
        },
      ],
      childOrigins: ['https://job-boards.greenhouse.io'],
      error: '',
    };
  }

  it('returns a clean, well-formed scan as it is', () => {
    expect(sanitizeFrameScan(leverScan())).toEqual(leverScan());
  });

  it('accepts the report of a frame whose scan failed: nothing found, only an error', () => {
    // Empty texts and empty lists are valid values, not missing ones.
    const failed: FrameScan = {
      url: 'https://job-boards.greenhouse.io/embed/job_app?for=analyticalengines&token=1',
      top: false,
      shown: false,
      job: { title: '', company: '' },
      fields: [],
      childOrigins: [],
      error: "TypeError: Cannot read properties of null (reading 'form')",
    };

    expect(sanitizeFrameScan(failed)).toEqual({
      url: 'https://job-boards.greenhouse.io/embed/job_app?for=analyticalengines&token=1',
      top: false,
      shown: false,
      job: { title: '', company: '' },
      fields: [],
      childOrigins: [],
      error: "TypeError: Cannot read properties of null (reading 'form')",
    });
  });

  it('drops members it does not know, at every level', () => {
    // `any`: these tests build exactly the values the types forbid.
    const scan: any = leverScan();
    scan.profile = { email: 'ada@example.com' };
    scan.job.salary = '1';
    scan.fields[0].value = 'ada@example.com';
    scan.fields[0].descriptor.outerHTML = '<input name="email">';
    scan.fields[1].descriptor.options[1].selected = true;

    expect(sanitizeFrameScan(scan)).toEqual(leverScan());
  });

  const notScans: [name: string, value: unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['a string', 'https://jobs.lever.co/'],
    ['a number', 42],
    ['true', true],
    ['an empty list', []],
    ['a list holding a scan', [leverScan()]],
  ];

  it.each(notScans)('gives null for %s', (_name, value) => {
    expect(sanitizeFrameScan(value)).toBe(null);
  });

  // One thing wrong at a time, in an otherwise valid scan.
  const flaws: [name: string, breakIt: (scan: any) => void][] = [
    ['the url is missing', (scan) => delete scan.url],
    ['the url is a number', (scan) => (scan.url = 42)],
    ['top is text', (scan) => (scan.top = 'true')],
    ['top is missing', (scan) => delete scan.top],
    // A missing answer must never be read as "this frame is shown".
    ['shown is missing', (scan) => delete scan.shown],
    ['shown is 1', (scan) => (scan.shown = 1)],
    ['job is missing', (scan) => delete scan.job],
    ['job is null', (scan) => (scan.job = null)],
    ['job is text', (scan) => (scan.job = 'Software Engineer')],
    ['the job title is null', (scan) => (scan.job.title = null)],
    ['the company is missing', (scan) => delete scan.job.company],
    ['fields is missing', (scan) => delete scan.fields],
    ['fields is an object', (scan) => (scan.fields = { 0: scan.fields[0] })],
    ['childOrigins is missing', (scan) => delete scan.childOrigins],
    ['childOrigins is text', (scan) => (scan.childOrigins = 'https://job-boards.greenhouse.io')],
    ['a child origin is null', (scan) => (scan.childOrigins = [null])],
    ['error is missing', (scan) => delete scan.error],
    ['error is an object', (scan) => (scan.error = { message: 'boom' })],

    ['a field is null', (scan) => (scan.fields[1] = null)],
    ['a field is text', (scan) => (scan.fields[1] = 'email')],
    ['a ref is missing', (scan) => delete scan.fields[0].ref],
    ['a ref is text', (scan) => (scan.fields[0].ref = '0')],
    ['a ref has a fraction', (scan) => (scan.fields[0].ref = 0.5)],
    ['a ref is NaN', (scan) => (scan.fields[0].ref = NaN)],
    ['a ref is Infinity', (scan) => (scan.fields[0].ref = Infinity)],
    ['a form index is missing', (scan) => delete scan.fields[0].form],
    ['a form index is text', (scan) => (scan.fields[0].form = '-1')],
    ['a form index has a fraction', (scan) => (scan.fields[0].form = 1.5)],
    ['a form index is null', (scan) => (scan.fields[0].form = null)],
    ['empty is missing', (scan) => delete scan.fields[2].empty],
    ['empty is text', (scan) => (scan.fields[2].empty = 'no')],
    ['a descriptor is missing', (scan) => delete scan.fields[0].descriptor],
    ['a descriptor is null', (scan) => (scan.fields[0].descriptor = null)],

    ['a control type is missing', (scan) => delete scan.fields[0].descriptor.control],
    // Checkboxes are never collected, so a scan that lists one is not ours.
    ['a control type is one we do not collect', (scan) => (scan.fields[0].descriptor.control = 'checkbox')],
    ['a control type is in the wrong case', (scan) => (scan.fields[0].descriptor.control = 'Text')],
    // Names every object has: a careless `value in TABLE` check lets them through.
    ['a control type is "toString"', (scan) => (scan.fields[0].descriptor.control = 'toString')],
    ['a control type is "constructor"', (scan) => (scan.fields[0].descriptor.control = 'constructor')],
    ['inputType is missing', (scan) => delete scan.fields[0].descriptor.inputType],
    ['autocomplete is null', (scan) => (scan.fields[0].descriptor.autocomplete = null)],
    ['a label is a number', (scan) => (scan.fields[0].descriptor.label = 7)],
    ['a label is a list', (scan) => (scan.fields[0].descriptor.label = ['Email'])],
    ['a group label is missing', (scan) => delete scan.fields[0].descriptor.groupLabel],
    ['a name is null', (scan) => (scan.fields[0].descriptor.name = null)],
    ['an id is a number', (scan) => (scan.fields[0].descriptor.id = 0)],
    ['a placeholder is missing', (scan) => delete scan.fields[0].descriptor.placeholder],
    ['hints is a list', (scan) => (scan.fields[0].descriptor.hints = ['email-input'])],
    ['accept is missing', (scan) => delete scan.fields[2].descriptor.accept],
    ['required is text', (scan) => (scan.fields[0].descriptor.required = 'true')],
    ['required is missing', (scan) => delete scan.fields[0].descriptor.required],
    ['options is missing', (scan) => delete scan.fields[0].descriptor.options],
    ['options is null', (scan) => (scan.fields[0].descriptor.options = null)],
    ['an option is null', (scan) => (scan.fields[1].descriptor.options[1] = null)],
    ['an option is text', (scan) => (scan.fields[1].descriptor.options[1] = 'Yes')],
    ['an option label is a number', (scan) => (scan.fields[1].descriptor.options[1].label = 1)],
    ['an option value is missing', (scan) => delete scan.fields[1].descriptor.options[1].value],
    ['an option says disabled in text', (scan) => (scan.fields[1].descriptor.options[1].disabled = 'false')],
  ];

  it.each(flaws)('gives null when %s', (_name, breakIt) => {
    const scan = leverScan();
    breakIt(scan);

    expect(sanitizeFrameScan(scan)).toBe(null);
  });

  // A page chooses its own labels. What we classify and show must be what a
  // person would read: no characters that cannot be seen, and none that make
  // the text run in another direction on screen than in memory.
  const texts: [name: string, raw: string, want: string][] = [
    ['a null character', 'First\u0000 name', 'First name'],
    ['a control character inside a word, which leaves no gap', 'Em\u0008ail', 'Email'],
    ['a bell and an escape', '\u0007Email\u001b', 'Email'],
    ['a delete character', 'Phone\u007f', 'Phone'],
    ['C1 control characters', 'City\u0080\u0085\u009f', 'City'],
    ['a right-to-left override in the middle of a word', 'Em\u202eail', 'Email'],
    ['every embedding, override and isolate', '\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069Phone', 'Phone'],
    ['direction marks', 'Phone\u200e\u200f\u061c', 'Phone'],
    // Hyphenation scripts put soft hyphens into long words. "Acknowledgement" must
    // still read as the word that marks a field we never fill.
    ['a soft hyphen inside a word', 'Acknowl\u00adedgement', 'Acknowledgement'],
    ['a zero-width space inside a word', 'Sig\u200bnature', 'Signature'],
    ['a word joiner', 'Sig\u2060nature', 'Signature'],
    ['a byte-order mark, which JavaScript counts as white space', 'Sig\ufeffnature', 'Signature'],
    ['line breaks and tabs, which read as spaces', 'Legal\n\tfirst\r\nname', 'Legal first name'],
    ['a vertical tab and a form feed', 'Legal\u000bfirst\u000cname', 'Legal first name'],
    ['line and paragraph separators', 'Legal\u2028first\u2029name', 'Legal first name'],
    ['a no-break space', 'First\u00a0name', 'First name'],
    ['runs of spaces', 'First    name', 'First name'],
    ['space around the text', '  Email  ', 'Email'],
    ['nothing a person could see', ' \u0000\u202e\n ', ''],
    // What must come through untouched.
    ['accented letters', 'Pr\u00e9nom', 'Pr\u00e9nom'],
    ['Japanese', '\u6c0f\u540d', '\u6c0f\u540d'],
    ['Hebrew (the script stays; only the control characters go)', '\u05e9\u05dd \u05e4\u05e8\u05d8\u05d9', '\u05e9\u05dd \u05e4\u05e8\u05d8\u05d9'],
    ['an emoji', 'Phone \u{1f4f1}', 'Phone \u{1f4f1}'],
    // U+200D is invisible too, but it is what holds this emoji together.
    ['a zero-width joiner', 'Engineer \u{1f469}\u200d\u{1f4bb}', 'Engineer \u{1f469}\u200d\u{1f4bb}'],
    // U+200C is part of how Persian is spelled.
    ['a zero-width non-joiner', '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645', '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645'],
    [
      'the punctuation of a real question',
      'Will you now or in the future require sponsorship (e.g. H-1B)?',
      'Will you now or in the future require sponsorship (e.g. H-1B)?',
    ],
  ];

  it.each(texts)('cleans a label: %s', (_name, raw, want) => {
    const scan = leverScan();
    scan.fields[0]!.descriptor.label = raw;

    expect(sanitizeFrameScan(scan)?.fields[0]?.descriptor.label).toBe(want);
  });

  /**
   * A copy of `value` with every free-text string in it, at any depth, passed
   * through `change`. `control` is left alone: it is one of six fixed words.
   */
  function changeEveryText<T>(value: T, change: (text: string) => string): T {
    if (typeof value === 'string') return change(value) as T;
    if (Array.isArray(value)) return value.map((entry) => changeEveryText(entry, change)) as T;
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value).map(([key, entry]) => [
        key,
        key === 'control' ? entry : changeEveryText(entry, change),
      ]);
      return Object.fromEntries(entries) as T;
    }
    return value;
  }

  it('cleans every text in a scan, not only labels', () => {
    const dirty = changeEveryText(leverScan(), (text) => `\u202e ${text}\u0000\n`);

    expect(sanitizeFrameScan(dirty)).toEqual(leverScan());
  });

  // A page decides how long its texts are. A 6 MB heading must not fill the
  // extension's storage or freeze the popup.
  const limits: [
    where: string,
    max: number,
    put: (scan: FrameScan, text: string) => void,
    get: (scan: FrameScan) => string | undefined,
  ][] = [
    ['the url', 2048, (scan, text) => (scan.url = text), (scan) => scan.url],
    ['the job title', 200, (scan, text) => (scan.job.title = text), (scan) => scan.job.title],
    ['the company', 200, (scan, text) => (scan.job.company = text), (scan) => scan.job.company],
    ['the error message', 200, (scan, text) => (scan.error = text), (scan) => scan.error],
    ['a child origin', 2048, (scan, text) => (scan.childOrigins = [text]), (scan) => scan.childOrigins[0]],
    ['a label', 4000, (scan, text) => (scan.fields[0]!.descriptor.label = text), (scan) => scan.fields[0]?.descriptor.label],
    [
      'a group label',
      4000,
      (scan, text) => (scan.fields[0]!.descriptor.groupLabel = text),
      (scan) => scan.fields[0]?.descriptor.groupLabel,
    ],
    [
      'an input type',
      200,
      (scan, text) => (scan.fields[0]!.descriptor.inputType = text),
      (scan) => scan.fields[0]?.descriptor.inputType,
    ],
    [
      'an autocomplete value',
      200,
      (scan, text) => (scan.fields[0]!.descriptor.autocomplete = text),
      (scan) => scan.fields[0]?.descriptor.autocomplete,
    ],
    ['a name', 200, (scan, text) => (scan.fields[0]!.descriptor.name = text), (scan) => scan.fields[0]?.descriptor.name],
    ['an id', 200, (scan, text) => (scan.fields[0]!.descriptor.id = text), (scan) => scan.fields[0]?.descriptor.id],
    [
      'a placeholder',
      200,
      (scan, text) => (scan.fields[0]!.descriptor.placeholder = text),
      (scan) => scan.fields[0]?.descriptor.placeholder,
    ],
    ['hints', 200, (scan, text) => (scan.fields[0]!.descriptor.hints = text), (scan) => scan.fields[0]?.descriptor.hints],
    [
      'an accept list',
      200,
      (scan, text) => (scan.fields[2]!.descriptor.accept = text),
      (scan) => scan.fields[2]?.descriptor.accept,
    ],
    [
      'an option label',
      120,
      (scan, text) => (scan.fields[1]!.descriptor.options[1]!.label = text),
      (scan) => scan.fields[1]?.descriptor.options[1]?.label,
    ],
    [
      'an option value',
      200,
      (scan, text) => (scan.fields[1]!.descriptor.options[1]!.value = text),
      (scan) => scan.fields[1]?.descriptor.options[1]?.value,
    ],
  ];

  it.each(limits)('cuts %s at %i characters', (_where, max, put, get) => {
    const scan = leverScan();
    put(scan, 'x'.repeat(5000));

    const clean = sanitizeFrameScan(scan);

    expect(clean && get(clean)).toBe('x'.repeat(max));
  });

  // Ordinary texts are cut at 200. A placeholder stands in for them: a label is allowed
  // to be longer, so that classification still sees the end of the question.
  const cuts: [name: string, raw: string, want: string][] = [
    ['keeps a text that is exactly at the limit', 'x'.repeat(200), 'x'.repeat(200)],
    ['counts only what is left after cleaning', '\u202e'.repeat(300) + 'Email', 'Email'],
    ['leaves no space at the end of a cut text', 'x'.repeat(199) + ' and more', 'x'.repeat(199)],
    // An emoji takes two units; cutting between them would leave a broken character.
    ['drops an emoji that only half fits', 'x'.repeat(199) + '\u{1f4f1} and more', 'x'.repeat(199)],
    ['keeps an emoji that just fits', 'x'.repeat(198) + '\u{1f4f1} and more', 'x'.repeat(198) + '\u{1f4f1}'],
  ];

  it.each(cuts)('%s', (_name, raw, want) => {
    const scan = leverScan();
    scan.fields[0]!.descriptor.placeholder = raw;

    expect(sanitizeFrameScan(scan)?.fields[0]?.descriptor.placeholder).toBe(want);
  });

  it('keeps a label whose safety word sits past character 200, so the question is still refused', () => {
    // The preamble is a real authorization question. The word that reverses it is past the
    // old 200-character cut. Losing that word would make this look like a plain "yes".
    let label = 'Are you legally authorized to work in the United States';
    while (label.length < 201) label += ' for the role';
    label += ' without visa sponsorship?';
    expect(label.indexOf('without')).toBeGreaterThan(200);

    const scan = leverScan();
    scan.fields[0]!.descriptor.label = label;
    const kept = sanitizeFrameScan(scan)?.fields[0]?.descriptor.label;

    expect(kept).toBe(label);
    expect(classifyWorkEligibility(kept ?? '')).toBeNull();
    expect(classifyWorkEligibility(label.slice(0, 200))).toBe('workAuthorization');
  });

  // A page also decides how many controls, options and frames it has.
  it('keeps at most 400 fields, the first ones', () => {
    const scan = leverScan();
    const field = scan.fields[0]!;
    scan.fields = Array.from({ length: 450 }, (_, ref) => ({ ...field, ref }));

    const fields = sanitizeFrameScan(scan)?.fields;

    expect(fields).toHaveLength(400);
    expect(fields?.[0]?.ref).toBe(0);
    expect(fields?.[399]?.ref).toBe(399);
  });

  // Options are chosen by position, so the ones kept must keep their positions.
  it('keeps at most 200 options of a field, the first ones', () => {
    const scan = leverScan();
    scan.fields[1]!.descriptor.options = Array.from({ length: 250 }, (_, index) => ({
      label: `Option ${index}`,
      value: `${index}`,
      disabled: false,
    }));

    const options = sanitizeFrameScan(scan)?.fields[1]?.descriptor.options;

    expect(options).toHaveLength(200);
    expect(options?.[0]).toEqual({ label: 'Option 0', value: '0', disabled: false });
    expect(options?.[199]).toEqual({ label: 'Option 199', value: '199', disabled: false });
  });

  it('keeps at most 100 child origins, the first ones', () => {
    const scan = leverScan();
    scan.childOrigins = Array.from({ length: 150 }, (_, index) => `https://frame-${index}.example`);

    const childOrigins = sanitizeFrameScan(scan)?.childOrigins;

    expect(childOrigins).toHaveLength(100);
    expect(childOrigins?.[0]).toBe('https://frame-0.example');
    expect(childOrigins?.[99]).toBe('https://frame-99.example');
  });
});
