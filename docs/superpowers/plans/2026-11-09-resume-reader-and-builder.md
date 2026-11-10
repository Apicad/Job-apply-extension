# Résumé Reader and Builder (Part A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two tested libraries: one reads an uploaded résumé (PDF or .docx) into a draft of the profile, the other builds a one-page résumé PDF from saved details.

**Architecture:** Plain TypeScript in `lib/`, run in extension pages and in Node tests. The reader works in two steps, file → text lines → draft, so that every reading rule is tested on hand-written lines with no file involved. The builder works in two steps, details → placed text → PDF, for the same reason. Neither touches extension storage, the network, or a job site's page.

**Tech Stack:** TypeScript (strict), Vitest. `pdfjs-dist` 6.5.438 reads PDFs, `pdf-lib` 1.17.1 with `@pdf-lib/fontkit` 1.1.1 writes them, `fflate` 0.8.3 unzips .docx, `@expo-google-fonts/public-sans` 0.4.2 supplies the font files. All five were tried together on 2026-11-09 under Node 24 and this project's Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-landing-experience-resume-design.md`, sections 8.2, 8.3, 8.5, 8.6, 10 and 11. This plan is Part A of that spec. Part B (the pages and storage) gets its own plan once this one is done.

## Global Constraints

- Use Node 24 (`nvm use`). The shell may default to Node 20, which is too old.
- No network at run time, no remotely loaded code. Open PDFs with `isEvalSupported: false`.
- Nothing in this plan uses `chrome.*` or `browser.*`.
- People in tests and test files are made up: the ones in `tests/unit/helpers/people.ts`, emails at `example.com`, phone numbers in the 555-01xx range.
- Explicit imports. Relative imports inside `lib/` and `tests/`. Types are imported with `import type`. Index access yields `T | undefined`.
- Each module exports constants typed with its contract from `lib/types.ts`, e.g. `export const parseMonth: ParseMonth = (text) => { … }`.
- Test first: write the test, watch it fail for the right reason, then write the code. Table-driven, literal expected values, no mocks of this project's modules.
- Shared files are `package.json`, `package-lock.json` and `lib/types.ts`. Read each as it is at that moment and only add to it. Never write `package.json` by hand.
- Do not edit `CLAUDE.md`, `entrypoints/`, `assets/`, `lib/page/`, `page-blueprint/`, or any `lib/*.ts` file this plan does not create. Other sessions are writing there.
- This plan creates only: `lib/months.ts`, `lib/work-history.ts`, `lib/resume-reader/`, `lib/resume-builder/`, `tests/unit/helpers/`, `tests/unit/months.test.ts`, `tests/unit/work-history.test.ts`, `tests/unit/resume-reader/`, `tests/unit/resume-builder/`, `tests/fixtures/resumes/`, `scripts/make-resume-fixtures.mjs`. List a folder before creating a file in it.
- Do not commit unless the owner has said this build may. Each task ends with a checkpoint: `npm run compile` clean and the task's tests green. If commits are allowed, commit only this task's files then, with the message given.
- Values from the spec: résumés over 4 MiB are refused (`MAX_RESUME_BYTES` in `lib/resume.ts`); only `.pdf` and `.docx` are read; at most 10 pages are read; the page is US Letter, 612 × 792 pt; body type never goes below 9.5 pt.
- A test file that opens or builds a PDF starts with `// @vitest-environment node`. Under jsdom, `pdf-lib` rejects Node buffers.
- In Node, import pdf.js from `pdfjs-dist/legacy/build/pdf.mjs`. The main build fails there.

## Review Focus

Things a person will run into that the spec does not spell out. Each has a test in the task named.

1. A PDF whose text arrives one letter per run, as LaTeX and some Word exports produce. Words must come out whole, not spaced out letter by letter. (Task 7)
2. Odd characters in extracted text: the "ﬁ" ligature, non-breaking spaces, soft hyphens, zero-width characters. "Certiﬁed" must read as "Certified" and "Jun 2026" with a non-breaking space must still be a month. (Tasks 2 and 7)
3. A long unbroken string in the saved details, such as a 140-character link. The built page must wrap it inside the margins. (Task 4)
4. Blank entries in the saved details: an empty bullet, a job with no title and no company, an empty skill. The built résumé leaves them out, with no stray bullet marks or commas. (Task 4)
5. Date ranges written without spaces or with other dashes: "Jun 2026–Aug 2026", "06/2026 - 08/2026", "June 2026 to August 2026". All are ranges. (Task 2)

## Files

```
lib/types.ts                        append: data types and function contracts (Task 1)
lib/months.ts                       months and date ranges (Task 2)
lib/work-history.ts                 empty work history, job order (Task 3)
lib/resume-builder/layout.ts        details → placed text (Task 4)
lib/resume-builder/check.ts         can a résumé be built? (Task 5)
lib/resume-builder/build.ts         placed text → PDF bytes (Task 6)
lib/resume-reader/lines.ts          text runs → lines (Task 7)
lib/resume-reader/pdf.ts            pdf.js document → lines (Task 8)
lib/resume-reader/file.ts           type and size checks (Task 8)
lib/resume-reader/docx.ts           .docx bytes → lines (Task 9)
lib/resume-reader/sections.ts       lines → sections (Task 10)
lib/resume-reader/contact.ts        header → contact fields (Task 11)
lib/resume-reader/education.ts      (Task 12)
lib/resume-reader/jobs.ts           (Task 13)
lib/resume-reader/projects.ts       (Task 14)
lib/resume-reader/skills.ts         (Task 14)
lib/resume-reader/read.ts           lines → draft; column guard (Task 15)
lib/resume-reader/apply.ts          draft + saved details → details (Task 16)
tests/unit/helpers/people.ts        the made-up people (Task 3)
tests/unit/helpers/pdf.ts           open a PDF in tests; the font files (Task 6)
tests/unit/resume-reader/helpers.ts hand-written lines for tests (Task 7)
tests/fixtures/resumes/src/         sources of the test résumés (Task 8)
tests/fixtures/resumes/             the generated .pdf and .docx files (Task 8)
scripts/make-resume-fixtures.mjs    regenerates them (Task 8)
```

---

### Task 1: Dependencies and shared types

**Files:**
- Modify: `package.json`, `package-lock.json` (through npm only)
- Modify: `lib/types.ts` (append at the end)

**Interfaces:**
- Produces: every type and contract in the block below. Later tasks name them without repeating them.

- [ ] **Step 1: Install the five libraries**

Check that no other install is running: `pgrep -fl "npm (install|ci)"` prints nothing. Then:

```bash
npm install --save-exact pdfjs-dist@6.5.438 pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1 fflate@0.8.3 @expo-google-fonts/public-sans@0.4.2
```

Verify: `node -p "Object.keys(require('./package.json').dependencies).sort().join(' ')"`
Expected: `@expo-google-fonts/public-sans @fontsource-variable/public-sans @pdf-lib/fontkit fflate pdf-lib pdfjs-dist react react-dom`, plus anything another session has added since. Nothing that was there is gone.

- [ ] **Step 2: Append the types to `lib/types.ts`**

Read the file first. Add this block after its last line, unchanged:

```ts
// ---------------------------------------------------------------------------
// Work history, the résumé reader and the résumé builder.
// Design: docs/superpowers/specs/2026-11-09-landing-experience-resume-design.md
// These run in extension pages and in tests, never in a job site's page.
// ---------------------------------------------------------------------------

/** One job. '' always means "no value". */
export interface Job {
  id: string;
  title: string;
  company: string;
  /** 'YYYY-MM' or ''. */
  start: string;
  /** 'YYYY-MM' or ''. Ignored when `current` is true. */
  end: string;
  current: boolean;
  /** One entry per bullet, in order. */
  lines: string[];
}

/** One project. */
export interface Project {
  id: string;
  name: string;
  /** A web address, or ''. */
  link: string;
  /** One entry per bullet, in order. */
  lines: string[];
}

/** What a résumé needs beyond `Profile`. */
export interface WorkHistory {
  jobs: Job[];
  /** In the order the person arranged them. */
  projects: Project[];
  skills: string[];
}

/** Which file is attached when a form asks for a résumé. */
export type ResumeChoice = 'uploaded' | 'built';

/** Everything a résumé is built from, and everything an upload can change. */
export interface ResumeDetails {
  profile: Profile;
  work: WorkHistory;
}

/** A calendar month; `month` runs 1 to 12. */
export interface YearMonth {
  year: number;
  month: number;
}

/** The `Profile` fields a résumé can supply. */
export type ResumeProfileField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'city'
  | 'state'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'school'
  | 'degree'
  | 'major'
  | 'graduationDate'
  | 'gpa';

/** A job as read from a file. A field the reader was not sure of is ''. */
export interface DraftJob extends Job {
  /** Header text the reader could not place, or ''. */
  leftover: string;
}

/** What the reader made of a file. Nothing in it is saved until the user says so. */
export interface ImportDraft {
  /** '' means "not found". */
  profile: Record<ResumeProfileField, string>;
  /** Text the reader saw for a field but could not place. */
  leftovers: Partial<Record<ResumeProfileField, string>>;
  jobs: DraftJob[];
  projects: Project[];
  skills: string[];
  /** Text from the file that was used nowhere, in reading order. */
  unused: string[];
  /** 'columns': the file is laid out in columns, so only pattern-matched contact details were read. */
  layout: 'single' | 'columns';
}

/** One run of text as a file gives it. x from the left edge, y from the bottom, in points. */
export interface TextItem {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

/** One visual line of a file. */
export interface TextLine {
  page: number;
  /** Left edge of the first piece. */
  x: number;
  /** The text, split wherever there is a wide gap: "Title … Jun 2026 – Aug 2026" is two pieces. */
  pieces: string[];
  /** Left edge of each piece. */
  pieceX: number[];
  /** The line began with a bullet mark, which has been removed. */
  bullet: boolean;
  /** The line starts to the right of the file's left margin. */
  indented: boolean;
  /** The line reaches the file's right margin, so the next line may continue it. */
  fullWidth: boolean;
  /** The pieces joined with single spaces. */
  text: string;
}

/** Why a file cannot be read as a résumé. */
export type ResumeFileProblem = 'unsupportedType' | 'tooLarge' | 'empty' | 'needsPassword' | 'cannotOpen' | 'noText';

/** The part of a pdf.js document the reader uses. Whoever calls the reader loads the document. */
export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: readonly unknown[] }> }>;
}

export interface PdfLines {
  lines: TextLine[];
  pagesRead: number;
  totalPages: number;
}

export type SectionKind = 'header' | 'education' | 'experience' | 'projects' | 'skills' | 'other';

export interface Section {
  kind: SectionKind;
  /** The heading as written; '' for the header. */
  heading: string;
  lines: TextLine[];
}

/** What one part of the reader found, and the lines it took something from. */
export interface FieldsReading {
  values: Partial<Record<ResumeProfileField, string>>;
  leftovers: Partial<Record<ResumeProfileField, string>>;
  used: TextLine[];
}

export type FontRole = 'regular' | 'bold';

/** `y` is the baseline, measured from the bottom of the page, in points. */
export interface PlacedText {
  text: string;
  x: number;
  y: number;
  size: number;
  font: FontRole;
}

export interface PlacedRule {
  x1: number;
  x2: number;
  y: number;
}

export interface ResumePage {
  texts: PlacedText[];
  rules: PlacedRule[];
}

export interface ResumeLayout {
  pages: ResumePage[];
  /** The body type size that was used. */
  bodySize: number;
}

/** Width in points of `text` set in `font` at `size`. */
export type Measure = (text: string, font: FontRole, size: number) => number;

export interface UnsupportedCharacter {
  character: string;
  /** The field it is in, in the user's words: "Last name", "Job 2 company". */
  where: string;
}

export interface ResumeFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

export type BuildResult =
  | { ok: true; pdf: Uint8Array; pages: number; bodySize: number; fileName: string }
  | { ok: false; reason: 'incomplete'; missing: ('name' | 'content')[] }
  | { ok: false; reason: 'unsupportedCharacters'; characters: UnsupportedCharacter[] };

/** lib/months.ts — pure. */
export type ParseMonth = (text: string) => string;
export type FormatMonth = (month: string) => string;
export type ParseDateRange = (text: string) => { start: string; end: string; current: boolean } | null;
export type IsDateText = (text: string) => boolean;

/** lib/work-history.ts — pure. */
export type EmptyWorkHistory = () => WorkHistory;
export type SortJobs = (jobs: readonly Job[]) => Job[];

/** lib/resume-builder/layout.ts — pure. */
export type LayoutResume = (details: ResumeDetails, measure: Measure, today: YearMonth) => ResumeLayout;
/** lib/resume-builder/check.ts — pure. */
export type MissingForResume = (details: ResumeDetails) => ('name' | 'content')[];
export type FindUnsupportedCharacters = (
  details: ResumeDetails,
  supports: (codePoint: number) => boolean,
) => UnsupportedCharacter[];
/** lib/resume-builder/build.ts */
export type ResumeFileName = (profile: Profile) => string;
export type BuildResume = (details: ResumeDetails, fonts: ResumeFonts, today: YearMonth) => Promise<BuildResult>;

/** lib/resume-reader/lines.ts — pure. */
export type NormalizeText = (text: string) => string;
export type LinesFromItems = (items: readonly TextItem[]) => TextLine[];
/** lib/resume-reader/pdf.ts */
export type LinesFromPdf = (doc: PdfDocumentLike) => Promise<PdfLines>;
/** lib/resume-reader/docx.ts — needs DOMParser, so pages and jsdom only. Throws when the bytes are not a .docx. */
export type LinesFromDocx = (bytes: Uint8Array) => TextLine[];
/** lib/resume-reader/file.ts — pure. */
export type CheckResumeFile = (file: { name: string; size: number }) => ResumeFileProblem | null;
export type ProblemFromOpenError = (error: unknown) => ResumeFileProblem;
/** lib/resume-reader/sections.ts, contact.ts, education.ts, jobs.ts, projects.ts, skills.ts — pure. */
export type SplitSections = (lines: readonly TextLine[]) => Section[];
export type ReadContact = (header: readonly TextLine[]) => FieldsReading;
export type ReadEducation = (lines: readonly TextLine[]) => FieldsReading;
export type ReadJobs = (lines: readonly TextLine[]) => { jobs: DraftJob[]; used: TextLine[] };
export type ReadProjects = (lines: readonly TextLine[]) => { projects: Project[]; extra: string[]; used: TextLine[] };
export type ReadSkills = (lines: readonly TextLine[]) => { skills: string[]; extra: string[]; used: TextLine[] };
/** lib/resume-reader/read.ts — pure. */
export type LooksLikeColumns = (lines: readonly TextLine[]) => boolean;
export type ReadResume = (lines: readonly TextLine[]) => ImportDraft;
/** lib/resume-reader/apply.ts — pure. Returns new objects. */
export type ApplyDraft = (saved: ResumeDetails, draft: ImportDraft) => ResumeDetails;
```

- [ ] **Step 3: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 4: Checkpoint**

Commit message, if allowed: `chore: add résumé libraries and shared types`

---

### Task 2: Months and date ranges

**Files:**
- Create: `lib/months.ts`
- Test: `tests/unit/months.test.ts`

**Interfaces:**
- Produces: `parseMonth: ParseMonth`, `formatMonth: FormatMonth`, `parseDateRange: ParseDateRange`, `isDateText: IsDateText`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { formatMonth, isDateText, parseDateRange, parseMonth } from '../../lib/months';

describe('parseMonth', () => {
  test.each([
    ['Jun 2026', '2026-06'],
    ['June 2026', '2026-06'],
    ['Sept 2025', '2025-09'],
    ['Sep. 2025', '2025-09'],
    ['MAY 2027', '2027-05'],
    ['06/2026', '2026-06'],
    ['6/2026', '2026-06'],
    ['2026-06', '2026-06'],
    ['Jun 2026', '2026-06'],
    // must not match
    ['2026', ''],
    ['Summer 2026', ''],
    ['13/2026', ''],
    ['Jun 26', ''],
    ['Version 2026', ''],
    ['', ''],
  ])('%j → %j', (text, expected) => {
    expect(parseMonth(text)).toBe(expected);
  });
});

describe('formatMonth', () => {
  test.each([
    ['2026-06', 'Jun 2026'],
    ['2025-09', 'Sep 2025'],
    ['', ''],
    ['2026', ''],
    ['2026-13', ''],
  ])('%j → %j', (month, expected) => {
    expect(formatMonth(month)).toBe(expected);
  });
});

describe('parseDateRange', () => {
  const summer = { start: '2026-06', end: '2026-08', current: false };
  const ongoing = { start: '2025-09', end: '', current: true };
  test.each([
    ['Jun 2026 – Aug 2026', summer],
    ['Jun 2026–Aug 2026', summer],
    ['Jun 2026 — Aug 2026', summer],
    ['Jun 2026 - Aug 2026', summer],
    ['June 2026 to August 2026', summer],
    ['06/2026 - 08/2026', summer],
    ['Analytical Engines Ltd. | Jun 2026 – Aug 2026', summer],
    ['Sep 2025 – Present', ongoing],
    ['Sep 2025 - current', ongoing],
    ['Sep 2025 – Now', ongoing],
    // must not match
    ['2024 – 2025', null],
    ['Jun 2026', null],
    ['Built 3 – 5 services in May 2026', null],
    ['May 2026 – 14 defects', null],
    ['Present', null],
    ['', null],
  ])('%j', (text, expected) => {
    expect(parseDateRange(text)).toEqual(expected);
  });
});

describe('isDateText', () => {
  test.each([
    ['Jun 2026 – Aug 2026', true],
    ['Sep 2025 – Present', true],
    ['May 2027', true],
    ['Expected May 2027', true],
    ['Graduating May 2027', true],
    ['Anticipated: May 2027', true],
    ['Class of 2027', true],
    ['2024 – 2025', true],
    // must not match
    ['London, UK', false],
    ['Arlington, VA', false],
    ['Fixed 14 defects in May 2026', false],
    ['Software Engineer', false],
    ['', false],
  ])('%j → %j', (text, expected) => {
    expect(isDateText(text)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/months.test.ts`
Expected: FAIL, cannot resolve `../../lib/months`.

- [ ] **Step 3: Implement the four functions in `lib/months.ts`**

- `parseMonth`: the whole text, trimmed and with any kind of space treated as a space, must be a month name or its three or four letter short form (optional full stop) followed by a four-digit year, or `M/YYYY`, `MM/YYYY`, or `YYYY-MM`. Month 1 to 12 only.
- `parseDateRange`: find `<month> <dash or "to"> <month | Present | Current | Now>` anywhere in the text, where each `<month>` is something `parseMonth` accepts. Dash is `-`, `–` or `—`, with or without spaces.
- `isDateText`: after removing the lead words `Expected`, `Graduating`, `Graduation`, `Anticipated` and `Class of`, month names, `M/YYYY`, four-digit years, dashes, `to`, `Present`, `Current`, `Now`, colons and spaces, nothing is left, and the text held at least one year or one of the three "now" words.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/months.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: parse and format months and date ranges`

---

### Task 3: Job order and the made-up people

**Files:**
- Create: `lib/work-history.ts`
- Create: `tests/unit/helpers/people.ts`
- Test: `tests/unit/work-history.test.ts`

**Interfaces:**
- Produces: `emptyWorkHistory: EmptyWorkHistory`, `sortJobs: SortJobs`.
- Produces for tests: `blankProfile(): Profile`, and `ada`, `grace`, `alan` of type `ResumeDetails`, `margaretContact`.

- [ ] **Step 1: Write `tests/unit/helpers/people.ts`**

```ts
import type { Profile, ResumeDetails } from '../../../lib/types';

/** Every field of `Profile`, empty. The compiler flags this when `Profile` gains a field. */
export function blankProfile(): Profile {
  return {
    firstName: '', lastName: '', email: '', phone: '',
    addressLine1: '', city: '', state: '', postalCode: '', country: '',
    linkedin: '', github: '', portfolio: '',
    currentCompany: '', currentTitle: '',
    school: '', degree: '', major: '', graduationDate: '', gpa: '',
    workAuthorization: '', sponsorship: '',
    gender: '', race: '', veteran: '', disability: '',
  };
}

export const ada: ResumeDetails = {
  profile: {
    ...blankProfile(),
    firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '(415) 555-0100',
    city: 'Palo Alto', state: 'CA',
    linkedin: 'linkedin.com/in/ada-example', github: 'github.com/ada-example',
    school: 'University of London', degree: 'B.S.', major: 'Mathematics', graduationDate: '2027-05', gpa: '3.8',
  },
  work: {
    jobs: [
      {
        id: 'job-1', title: 'Software Engineering Intern', company: 'Analytical Engines Ltd.',
        start: '2026-06', end: '2026-08', current: false,
        lines: [
          'Built a punch-card job scheduler in TypeScript.',
          'Wrote tests for the calculation engine and fixed 14 reported defects.',
        ],
      },
      {
        id: 'job-2', title: 'Mathematics Tutor', company: 'University of London',
        start: '2025-09', end: '', current: true,
        lines: ['Tutored 12 first-year students in calculus and linear algebra each term.'],
      },
    ],
    projects: [
      {
        id: 'project-1', name: 'Bernoulli Numbers Calculator', link: 'github.com/ada-example/bernoulli',
        lines: ['A Python program that computes Bernoulli numbers step by step, with tests.'],
      },
    ],
    skills: ['Python', 'TypeScript', 'SQL', 'Git', 'Linear algebra'],
  },
};

export const grace: ResumeDetails = {
  profile: {
    ...blankProfile(),
    firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', phone: '(212) 555-0142',
    city: 'New York', state: 'NY', linkedin: 'linkedin.com/in/grace-example',
    school: 'Vassar College', degree: 'Bachelor of Arts', major: 'Computer Science', graduationDate: '2027-05', gpa: '3.9',
  },
  work: {
    jobs: [
      {
        id: 'job-1', title: 'Software Developer Intern', company: 'Compiler Works Inc.',
        start: '2026-06', end: '2026-08', current: false,
        lines: ['Wrote a linker for subroutines used by four teams.', 'Cut build time from 40 minutes to 12.'],
      },
      {
        id: 'job-2', title: 'Teaching Assistant', company: 'Vassar College',
        start: '2025-09', end: '', current: true,
        lines: ['Ran weekly lab sessions for 30 students.'],
      },
    ],
    projects: [
      { id: 'project-1', name: 'FLOW-MATIC Notes', link: '', lines: ['A study guide for an early English-like programming language.'] },
    ],
    skills: ['COBOL', 'Python', 'Java', 'Git', 'Docker'],
  },
};

export const alan: ResumeDetails = {
  profile: {
    ...blankProfile(),
    firstName: 'Alan', lastName: 'Turing', email: 'alan@example.com', phone: '(650) 555-0117',
    city: 'San Jose', state: 'CA', github: 'github.com/alan-example',
    school: "King's College", degree: 'B.S.', major: 'Computer Science', graduationDate: '2026-05',
  },
  work: {
    jobs: [
      {
        id: 'job-1', title: 'Research Assistant', company: 'Bombe Labs',
        start: '2026-01', end: '2026-05', current: false,
        lines: ['Automated 3 weekly reports with Python scripts.'],
      },
    ],
    projects: [],
    skills: ['Python', 'C', 'MATLAB'],
  },
};

/** The two-column test résumé. Only these two can be expected from it. */
export const margaretContact = { email: 'margaret@example.com', phone: '(617) 555-0163' };
```

- [ ] **Step 2: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { emptyWorkHistory, sortJobs } from '../../lib/work-history';
import type { Job } from '../../lib/types';

const job = (id: string, start: string): Job => ({ id, title: '', company: '', start, end: '', current: false, lines: [] });

test('an empty work history has no jobs, projects or skills', () => {
  expect(emptyWorkHistory()).toEqual({ jobs: [], projects: [], skills: [] });
});

test('jobs are ordered by start month, most recent first; undated jobs last, in the order given', () => {
  const jobs = [job('a', '2025-09'), job('b', ''), job('c', '2026-06'), job('d', ''), job('e', '2025-09')];
  expect(sortJobs(jobs).map((j) => j.id)).toEqual(['c', 'a', 'e', 'b', 'd']);
  expect(jobs.map((j) => j.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/unit/work-history.test.ts`
Expected: FAIL, cannot resolve `../../lib/work-history`.

- [ ] **Step 4: Implement `emptyWorkHistory` and `sortJobs` in `lib/work-history.ts`**

`sortJobs` returns a new array and keeps the given order between jobs that tie.

- [ ] **Step 5: Run the test, then type-check the helper**

Run: `npx vitest run tests/unit/work-history.test.ts && npm run compile`
Expected: PASS, and no type errors.

- [ ] **Step 6: Checkpoint**

Commit message, if allowed: `feat: job order, and the made-up people for tests`

---

### Task 4: Résumé layout

**Files:**
- Create: `lib/resume-builder/layout.ts`
- Test: `tests/unit/resume-builder/layout.test.ts`

**Interfaces:**
- Consumes: `formatMonth` (Task 2), `sortJobs` (Task 3).
- Produces: `layoutResume: LayoutResume`, and the constants `PAGE = { width: 612, height: 792, margin: 54 }` and `BODY_SIZES = [10.5, 10, 9.5]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { layoutResume } from '../../../lib/resume-builder/layout';
import type { Measure, ResumeDetails } from '../../../lib/types';
import { ada, blankProfile } from '../helpers/people';

/** Half the type size per character, whatever the font. */
const measure: Measure = (text, _font, size) => text.length * size * 0.5;
const today = { year: 2026, month: 11 };
const texts = (details: ResumeDetails) => layoutResume(details, measure, today).pages[0]!.texts;

test('sections come in order, with every line of the made-up résumé', () => {
  expect(texts(ada).map((t) => t.text)).toEqual([
    'Ada Lovelace',
    'Palo Alto, CA | ada@example.com | (415) 555-0100 | linkedin.com/in/ada-example',
    'github.com/ada-example',
    'Education',
    'University of London',
    'Expected May 2027',
    'B.S. in Mathematics, GPA 3.8',
    'Experience',
    'Software Engineering Intern, Analytical Engines Ltd.',
    'Jun 2026 – Aug 2026',
    '•',
    'Built a punch-card job scheduler in TypeScript.',
    '•',
    'Wrote tests for the calculation engine and fixed 14 reported defects.',
    'Mathematics Tutor, University of London',
    'Sep 2025 – Present',
    '•',
    'Tutored 12 first-year students in calculus and linear algebra each term.',
    'Projects',
    'Bernoulli Numbers Calculator',
    ' | github.com/ada-example/bernoulli',
    '•',
    'A Python program that computes Bernoulli numbers step by step, with tests.',
    'Skills',
    'Python, TypeScript, SQL, Git, Linear algebra',
  ]);
});

test('positions: left margin, right-aligned dates, bullet indent, heading rule', () => {
  const layout = layoutResume(ada, measure, today);
  const page = layout.pages[0]!;
  const find = (text: string) => page.texts.find((t) => t.text === text)!;
  expect(layout.bodySize).toBe(10.5);
  expect(find('Ada Lovelace')).toMatchObject({ x: 54, y: 717, size: 21, font: 'bold' });
  expect(find('Education')).toMatchObject({ x: 54, font: 'bold' });
  expect(find('Education').size).toBeCloseTo(12.6);
  expect(find('Jun 2026 – Aug 2026').x).toBeCloseTo(558 - 19 * 10.5 * 0.5);
  expect(find('Software Engineering Intern, Analytical Engines Ltd.').font).toBe('bold');
  expect(find('•').x).toBe(60);
  expect(find('Built a punch-card job scheduler in TypeScript.')).toMatchObject({ x: 70, font: 'regular' });
  expect(page.rules.length).toBe(4);
  expect(page.rules[0]).toMatchObject({ x1: 54, x2: 558 });
});

test('"Expected" is printed only while the graduation month is still ahead', () => {
  const later = layoutResume(ada, measure, { year: 2027, month: 6 }).pages[0]!.texts.map((t) => t.text);
  expect(later).toContain('May 2027');
  expect(later).not.toContain('Expected May 2027');
});

test('a long bullet wraps at word ends inside the right margin', () => {
  const words = Array.from({ length: 30 }, () => 'word12345');
  const details: ResumeDetails = {
    profile: { ...blankProfile(), firstName: 'Ada', lastName: 'Lovelace' },
    work: { jobs: [{ id: 'j', title: 'Tutor', company: '', start: '', end: '', current: false, lines: [words.join(' ')] }], projects: [], skills: [] },
  };
  const nine = words.slice(0, 9).join(' ');
  expect(texts(details).map((t) => t.text)).toEqual([
    'Ada Lovelace', 'Experience', 'Tutor', '•', nine, nine, nine, words.slice(0, 3).join(' '),
  ]);
});

describe('fitting on the page', () => {
  const withBullets = (count: number): ResumeDetails => ({
    profile: { ...blankProfile(), firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    work: {
      jobs: [{ id: 'j', title: 'Tutor', company: '', start: '', end: '', current: false, lines: Array.from({ length: count }, (_, i) => `Line ${i + 1}`) }],
      projects: [],
      skills: [],
    },
  });
  test.each([
    [40, 10.5, 1],
    [41, 10, 1],
    [42, 10, 1],
    [43, 9.5, 1],
    [45, 9.5, 1],
    [46, 9.5, 2],
  ])('%i bullets → body %f pt on %i page(s)', (count, bodySize, pages) => {
    const layout = layoutResume(withBullets(count), measure, today);
    expect([layout.bodySize, layout.pages.length]).toEqual([bodySize, pages]);
  });
});

test('a long unbroken string is broken inside the margins', () => {
  const details: ResumeDetails = {
    profile: { ...blankProfile(), firstName: 'Ada', lastName: 'Lovelace' },
    work: { jobs: [], projects: [{ id: 'p', name: 'Site', link: `https://example.com/${'a'.repeat(140)}`, lines: [`${'b'.repeat(140)}`] }], skills: ['c'.repeat(140)] },
  };
  const layout = layoutResume(details, measure, today);
  for (const page of layout.pages) {
    for (const t of page.texts) {
      expect(t.x + measure(t.text, t.font, t.size)).toBeLessThanOrEqual(558.001);
      expect(t.y).toBeGreaterThanOrEqual(54);
    }
  }
});

test('blank entries are left out', () => {
  const details: ResumeDetails = {
    profile: { ...blankProfile(), firstName: 'Ada', lastName: 'Lovelace' },
    work: {
      jobs: [
        { id: 'a', title: '', company: ' ', start: '', end: '', current: false, lines: ['', '  '] },
        { id: 'b', title: 'Tutor', company: '', start: '', end: '', current: false, lines: ['', 'Taught calculus.'] },
      ],
      projects: [{ id: 'p', name: '', link: '', lines: [] }],
      skills: ['Python', '', ' '],
    },
  };
  expect(texts(details).map((t) => t.text)).toEqual([
    'Ada Lovelace', 'Experience', 'Tutor', '•', 'Taught calculus.', 'Skills', 'Python',
  ]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-builder/layout.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-builder/layout`.

- [ ] **Step 3: Implement `layoutResume` in `lib/resume-builder/layout.ts`**

The tests fix these numbers, so follow them exactly. Let `s` be the body size.

Vertical rhythm:
- The cursor `top` starts at 738 on every page. To place one line of size `z`: its baseline is `y = top − z`, then `top` drops by `1.4 × z`. If `y` would be below 54, start a new page first.
- Name: size `2 × s`, bold. Contact lines: size `s`.
- Before each section heading, `top` drops by `s`. The heading is size `1.2 × s`, bold. A rule runs from x 54 to 558 at `y − 3`, and after it `top` drops by a further 4.
- Before each job and each project except the first in its section, `top` drops by `0.5 × s`.

Horizontal:
- Text starts at x 54 and must end by x 558. A bullet mark `•` sits at x 60 and its text at x 70.
- Wrap at spaces. A single word wider than the room left is broken between characters.
- A date goes on the same line as its heading text, right-aligned to 558 in the regular font. The heading text wraps within what is left, minus 12.

What is printed, with empty parts left out everywhere:
- Name: first and last name.
- Contact: `city, state`, email, phone, LinkedIn, GitHub, personal site, joined with ` | `. Wrap between parts only, so no line ends with a bar.
- Education, when there is a school, a degree or a major: the school in bold with the graduation month at the right (`formatMonth`, with `Expected ` in front while that month is after `today`); then `degree in major`, or whichever exists, then `, GPA x`.
- Experience, jobs in `sortJobs` order, skipping a job with no title and no company: `title, company` in bold; at the right `start – end`, or `start – Present` when current, or just the start; then one bullet per non-blank line.
- Projects, skipping a project with no name: the name in bold, then ` | link` in regular type straight after it as its own text; then bullets.
- Skills: the non-blank skills joined with `, `.

Fitting: lay out at each size in `BODY_SIZES` in turn and return the first that gives one page. If none does, return the 9.5 layout with as many pages as it takes.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-builder/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: lay out a résumé as placed text`

---

### Task 5: Can a résumé be built?

**Files:**
- Create: `lib/resume-builder/check.ts`
- Test: `tests/unit/resume-builder/check.test.ts`

**Interfaces:**
- Produces: `missingForResume: MissingForResume`, `findUnsupportedCharacters: FindUnsupportedCharacters`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { findUnsupportedCharacters, missingForResume } from '../../../lib/resume-builder/check';
import type { ResumeDetails } from '../../../lib/types';
import { ada, blankProfile } from '../helpers/people';

const empty: ResumeDetails = { profile: blankProfile(), work: { jobs: [], projects: [], skills: [] } };
const withProfile = (fields: Partial<ResumeDetails['profile']>): ResumeDetails => ({ ...empty, profile: { ...blankProfile(), ...fields } });

describe('missingForResume', () => {
  test.each([
    ['nothing saved', empty, ['name', 'content']],
    ['a name only', withProfile({ firstName: 'Ada' }), ['content']],
    ['a school only', withProfile({ school: 'University of London' }), ['name']],
    ['a name and a school', withProfile({ lastName: 'Lovelace', school: 'University of London' }), []],
    ['a name and skills only', { ...withProfile({ firstName: 'Ada' }), work: { jobs: [], projects: [], skills: ['Python'] } }, ['content']],
    ['the full made-up résumé', ada, []],
  ])('%s', (_name, details, expected) => {
    expect(missingForResume(details)).toEqual(expected);
  });
});

describe('findUnsupportedCharacters', () => {
  /** Latin, Latin Extended and Vietnamese, plus the punctuation a résumé uses. */
  const supports = (cp: number) => cp < 0x250 || (cp >= 0x1e00 && cp <= 0x1eff) || (cp >= 0x2010 && cp <= 0x2027);

  test('accented Latin and Vietnamese names pass', () => {
    expect(findUnsupportedCharacters(withProfile({ firstName: 'Zoë', lastName: 'Nguyễn' }), supports)).toEqual([]);
  });

  test('each unsupported character is reported once per field, in reading order', () => {
    const details: ResumeDetails = {
      profile: { ...blankProfile(), firstName: 'Ada', lastName: 'Иванов', school: '北京大学' },
      work: { jobs: [{ id: 'j', title: 'Intern', company: 'Ωmega Ltd.', start: '', end: '', current: false, lines: ['Shipped α and β builds.'] }], projects: [], skills: ['日本語'] },
    };
    expect(findUnsupportedCharacters(details, supports)).toEqual([
      { character: 'И', where: 'Last name' },
      { character: 'в', where: 'Last name' },
      { character: 'а', where: 'Last name' },
      { character: 'н', where: 'Last name' },
      { character: 'о', where: 'Last name' },
      { character: '北', where: 'School' },
      { character: '京', where: 'School' },
      { character: '大', where: 'School' },
      { character: '学', where: 'School' },
      { character: 'Ω', where: 'Job 1 company' },
      { character: 'α', where: 'Job 1 description' },
      { character: 'β', where: 'Job 1 description' },
      { character: '日', where: 'Skills' },
      { character: '本', where: 'Skills' },
      { character: '語', where: 'Skills' },
    ]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-builder/check.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-builder/check`.

- [ ] **Step 3: Implement both functions in `lib/resume-builder/check.ts`**

- `missingForResume`: `'name'` when first and last name are both blank; `'content'` when there is no school, no job with a title or a company, and no project with a name.
- `findUnsupportedCharacters` walks the fields in this order with these labels: `First name`, `Last name`, `City`, `State`, `Email`, `Phone`, `LinkedIn`, `GitHub`, `Personal site`, `School`, `Degree`, `Major`, `GPA`; then for each job in the order given `Job N title`, `Job N company`, `Job N description`; then `Project N name`, `Project N link`, `Project N description`; then `Skills`. Walk by code point, not by UTF-16 unit.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-builder/check.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: say what stops a résumé from being built`

---

### Task 6: The PDF file

**Files:**
- Create: `lib/resume-builder/build.ts`
- Create: `tests/unit/helpers/pdf.ts`
- Test: `tests/unit/resume-builder/build.test.ts`

**Interfaces:**
- Consumes: `layoutResume` (Task 4), `missingForResume`, `findUnsupportedCharacters` (Task 5).
- Produces: `resumeFileName: ResumeFileName`, `buildResume: BuildResume`.
- Produces for tests: `publicSans(): ResumeFonts`, `openPdf(bytes: Uint8Array): Promise<PdfDocumentLike>`, `pdfTextLines(bytes: Uint8Array): Promise<string[]>`.

- [ ] **Step 1: Write `tests/unit/helpers/pdf.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfDocumentLike, ResumeFonts } from '../../../lib/types';

const FONT_DIR = path.resolve(import.meta.dirname, '../../../node_modules/@expo-google-fonts/public-sans');

/** The two font files the résumé is set in. */
export function publicSans(): ResumeFonts {
  return {
    regular: new Uint8Array(fs.readFileSync(path.join(FONT_DIR, '400Regular/PublicSans_400Regular.ttf'))),
    bold: new Uint8Array(fs.readFileSync(path.join(FONT_DIR, '700Bold/PublicSans_700Bold.ttf'))),
  };
}

/** Opens PDF bytes with pdf.js, the way a page of the extension will. */
export async function openPdf(bytes: Uint8Array): Promise<PdfDocumentLike> {
  // pdf.js takes ownership of the array it is given, so hand it a copy.
  return getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
}

/** The text of a PDF, one string per baseline, top to bottom, runs joined with single spaces. */
export async function pdfTextLines(bytes: Uint8Array): Promise<string[]> {
  const doc = await openPdf(bytes);
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const { items } = await (await doc.getPage(n)).getTextContent();
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const item of items as { str?: string; transform?: number[] }[]) {
      if (!item.str?.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5] ?? 0);
      rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4] ?? 0, text: item.str }]);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      lines.push(rows.get(y)!.sort((a, b) => a.x - b.x).map((run) => run.text.trim()).join(' '));
    }
  }
  return lines;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { buildResume, resumeFileName } from '../../../lib/resume-builder/build';
import type { ResumeDetails } from '../../../lib/types';
import { ada, blankProfile } from '../helpers/people';
import { pdfTextLines, publicSans } from '../helpers/pdf';

const today = { year: 2026, month: 11 };
const named = (firstName: string, lastName: string): ResumeDetails => ({
  profile: { ...blankProfile(), firstName, lastName, school: 'University of London' },
  work: { jobs: [], projects: [], skills: [] },
});

test('the built file holds the résumé as real text', async () => {
  const result = await buildResume(ada, publicSans(), today);
  if (!result.ok) throw new Error(result.reason);
  expect([result.pages, result.bodySize, result.fileName]).toEqual([1, 10.5, 'Ada-Lovelace-Resume.pdf']);
  const lines = await pdfTextLines(result.pdf);
  expect(lines[0]).toBe('Ada Lovelace');
  for (const expected of [
    'Education',
    'University of London Expected May 2027',
    'B.S. in Mathematics, GPA 3.8',
    'Experience',
    'Software Engineering Intern, Analytical Engines Ltd. Jun 2026 – Aug 2026',
    '• Built a punch-card job scheduler in TypeScript.',
    'Mathematics Tutor, University of London Sep 2025 – Present',
    'Projects',
    'Bernoulli Numbers Calculator | github.com/ada-example/bernoulli',
    'Skills',
    'Python, TypeScript, SQL, Git, Linear algebra',
  ]) {
    expect(lines).toContain(expected);
  }
  expect(lines.join(' ')).toContain('ada@example.com');
});

test('accented and Vietnamese letters come through', async () => {
  const result = await buildResume(named('Zoë', 'Nguyễn'), publicSans(), today);
  if (!result.ok) throw new Error(result.reason);
  expect((await pdfTextLines(result.pdf))[0]).toBe('Zoë Nguyễn');
});

test('a letter the typeface lacks stops the build and is named', async () => {
  expect(await buildResume(named('Ada', 'Иванов'), publicSans(), today)).toEqual({
    ok: false,
    reason: 'unsupportedCharacters',
    characters: ['И', 'в', 'а', 'н', 'о'].map((character) => ({ character, where: 'Last name' })),
  });
});

test('too little to build is said, not built', async () => {
  const nothing: ResumeDetails = { profile: blankProfile(), work: { jobs: [], projects: [], skills: [] } };
  expect(await buildResume(nothing, publicSans(), today)).toEqual({ ok: false, reason: 'incomplete', missing: ['name', 'content'] });
});

test('content that does not fit one page shrinks to 9.5 pt, then runs on', async () => {
  const long: ResumeDetails = {
    profile: { ...blankProfile(), firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    work: {
      jobs: [{ id: 'j', title: 'Tutor', company: '', start: '', end: '', current: false, lines: Array.from({ length: 46 }, (_, i) => `Line ${i + 1}`) }],
      projects: [],
      skills: [],
    },
  };
  const result = await buildResume(long, publicSans(), today);
  if (!result.ok) throw new Error(result.reason);
  expect([result.pages, result.bodySize]).toEqual([2, 9.5]);
  expect(await pdfTextLines(result.pdf)).toContain('• Line 46');
});

describe('resumeFileName', () => {
  test.each([
    [{ firstName: 'Ada', lastName: 'Lovelace' }, 'Ada-Lovelace-Resume.pdf'],
    [{ firstName: 'Mary Ann', lastName: "O'Neil" }, 'Mary-Ann-ONeil-Resume.pdf'],
    [{ firstName: 'Zoë', lastName: 'Nguyễn' }, 'Zoë-Nguyễn-Resume.pdf'],
    [{ firstName: '../Ada', lastName: 'Love/lace' }, 'Ada-Lovelace-Resume.pdf'],
    [{ firstName: '', lastName: '' }, 'Resume.pdf'],
  ])('%j → %s', (name, expected) => {
    expect(resumeFileName({ ...blankProfile(), ...name })).toBe(expected);
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-builder/build.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-builder/build`.

- [ ] **Step 4: Implement `resumeFileName` and `buildResume` in `lib/resume-builder/build.ts`**

- `resumeFileName`: first and last name, letters and digits of any alphabet kept, each run of spaces turned into one hyphen, everything else dropped, then `-Resume.pdf`.
- `buildResume`, in this order: return `incomplete` if `missingForResume` is not empty. Create a `PDFDocument` from `pdf-lib`, `registerFontkit` with the default export of `@pdf-lib/fontkit`, and embed both fonts with `{ subset: true }`. A code point is supported when both fonts' `getCharacterSet()` hold it; return `unsupportedCharacters` if `findUnsupportedCharacters` finds any. Lay out with a `Measure` built on `widthOfTextAtSize`. Add one 612 × 792 page per laid-out page, `drawText` each placed text at its `x`, `y`, `size` in black, and draw each rule as a 0.75 pt black line. Set the document title to the person's name followed by ` – Resume`. Return `save()`'s bytes.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/resume-builder/build.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Commit message, if allowed: `feat: build the résumé PDF`

---

### Task 7: Lines from text runs

**Files:**
- Create: `lib/resume-reader/lines.ts`
- Create: `tests/unit/resume-reader/helpers.ts`
- Test: `tests/unit/resume-reader/lines.test.ts`

**Interfaces:**
- Produces: `normalizeText: NormalizeText`, `linesFromItems: LinesFromItems`.
- Produces for tests: `line(pieces, more?)` and `bullet(text, more?)`, which every later reader test uses.

- [ ] **Step 1: Write `tests/unit/resume-reader/helpers.ts`**

```ts
import type { TextLine } from '../../../lib/types';

/** A line as the reader sees it. Pass several strings for a line with wide gaps between its pieces. */
export function line(pieces: string | string[], more: Partial<TextLine> = {}): TextLine {
  const list = typeof pieces === 'string' ? [pieces] : pieces;
  return {
    page: 1,
    x: 54,
    pieces: list,
    pieceX: list.map((_, i) => 54 + i * 380),
    bullet: false,
    indented: false,
    fullWidth: false,
    text: list.join(' '),
    ...more,
  };
}

/** A bullet line: marked, and indented from the margin. */
export function bullet(text: string, more: Partial<TextLine> = {}): TextLine {
  return line(text, { x: 70, pieceX: [70], bullet: true, indented: true, ...more });
}
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { linesFromItems, normalizeText } from '../../../lib/resume-reader/lines';
import type { TextItem } from '../../../lib/types';

const run = (text: string, x: number, y: number, width: number, size = 11, page = 1): TextItem => ({ page, text, x, y, width, size });

describe('normalizeText', () => {
  test.each([
    ['Certiﬁed', 'Certified'],
    ['Oﬃce', 'Office'],
    ['Jun 2026', 'Jun 2026'],
    ['Type­Script', 'TypeScript'],
    ['A​B﻿', 'AB'],
    ['  two   spaces ', 'two spaces'],
  ])('%j → %j', (text, expected) => {
    expect(normalizeText(text)).toBe(expected);
  });
});

test('runs on one baseline make one line; a wide gap starts a new piece (Chromium)', () => {
  const items = [
    run('Software Engineering Intern, Analytical Engines Ltd.', 43.2, 594, 299.2),
    run(' ', 342.4, 594, 160.5),
    run('Jun 2026 – Aug 2026', 462.8, 594, 106),
    run('', 59.2, 577.5, 0),
    run('Built a punch-card job scheduler in TypeScript.', 59.2, 577.5, 228.9),
  ];
  expect(linesFromItems(items)).toEqual([
    {
      page: 1, x: 43.2,
      pieces: ['Software Engineering Intern, Analytical Engines Ltd.', 'Jun 2026 – Aug 2026'],
      pieceX: [43.2, 462.8],
      bullet: false, indented: false, fullWidth: true,
      text: 'Software Engineering Intern, Analytical Engines Ltd. Jun 2026 – Aug 2026',
    },
    {
      page: 1, x: 59.2,
      pieces: ['Built a punch-card job scheduler in TypeScript.'],
      pieceX: [59.2],
      bullet: false, indented: true, fullWidth: false,
      text: 'Built a punch-card job scheduler in TypeScript.',
    },
  ]);
});

test('one run per word is joined with spaces (macOS)', () => {
  const items = [run('Ada', 16.6, 763.3, 21.6, 12), run(' ', 38.2, 763.3, 0.6, 12), run('Lovelace', 45.4, 763.3, 57.6, 12)];
  expect(linesFromItems(items).map((l) => l.pieces)).toEqual([['Ada Lovelace']]);
});

test('one run per letter is joined without spaces', () => {
  const items = [run('A', 54, 700, 6, 10), run('d', 60, 700, 6, 10), run('a', 66, 700, 6, 10), run('L', 76, 700, 6, 10), run('.', 82, 700, 3, 10)];
  expect(linesFromItems(items).map((l) => l.text)).toEqual(['Ada L.']);
});

describe('bullet marks', () => {
  test.each([
    ['• Built a scheduler.', true, 'Built a scheduler.'],
    [' Built a scheduler.', true, 'Built a scheduler.'],
    ['- Built a scheduler.', true, 'Built a scheduler.'],
    ['– Built a scheduler.', true, 'Built a scheduler.'],
    ['* Built a scheduler.', true, 'Built a scheduler.'],
    // must not match
    ['-5% cost in one quarter', false, '-5% cost in one quarter'],
    ['C++ - systems work', false, 'C++ - systems work'],
    ['*nix administration', false, '*nix administration'],
  ])('%j', (text, isBullet, expected) => {
    const [only] = linesFromItems([run(text, 54, 700, 200)]);
    expect([only!.bullet, only!.text]).toEqual([isBullet, expected]);
  });

  test('a mark that arrives as its own run still counts', () => {
    const [only] = linesFromItems([run('•', 60, 700, 4), run('Built a scheduler.', 70, 700, 90)]);
    expect([only!.bullet, only!.text]).toEqual([true, 'Built a scheduler.']);
  });
});

test('lines come out page by page, top to bottom, whatever order the runs arrive in', () => {
  const items = [
    run('second page', 54, 700, 60, 11, 2),
    run('lower', 54, 600, 30),
    run('upper', 54, 650, 30),
    run('same', 54, 500, 24),
    run('line', 82, 500.4, 20),
  ];
  expect(linesFromItems(items).map((l) => l.text)).toEqual(['upper', 'lower', 'same line', 'second page']);
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/lines.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/lines`.

- [ ] **Step 4: Implement `normalizeText` and `linesFromItems` in `lib/resume-reader/lines.ts`**

- `normalizeText`: the ligatures ﬀ ﬁ ﬂ ﬃ ﬄ become their letters; non-breaking and other Unicode spaces become a space; soft hyphens, zero-width characters and byte-order marks are removed; runs of spaces collapse; the ends are trimmed.
- `linesFromItems`:
  - Normalise each run's text and drop runs left empty.
  - Two runs share a line when they are on the same page and their baselines differ by no more than 0.3 × the larger size.
  - Order lines by page, then top to bottom. Order runs left to right.
  - Between neighbours, the gap is the next run's `x` minus the previous run's `x + width`. A gap over 2.5 × size starts a new piece. Otherwise a gap over 0.15 × size puts one space between them. Otherwise they are joined directly.
  - A bullet mark is one of `• ◦ ▪ ■ ● ○ ‣ ⁃ ∙ ·`, U+F0B7 or U+F0A7 at the start of the line, or `-`, `–`, `—` or `*` at the start followed by a space. Remove it and set `bullet`.
  - `indented`: the line's `x` is at least 8 more than the smallest `x` of any line. `fullWidth`: the line's right edge is within 36 of the largest right edge of any line.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/lines.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Commit message, if allowed: `feat: turn text runs into lines`

---

### Task 8: Test résumés, and lines from a PDF

**Files:**
- Create: `tests/fixtures/resumes/src/ada-classic.html`, `grace-stacked.html`, `alan-compact.html`, `margaret-two-column.html`, `ada-plain.txt`
- Create: `scripts/make-resume-fixtures.mjs`
- Create (generated): `tests/fixtures/resumes/ada-classic.chromium.pdf`, `grace-stacked.chromium.pdf`, `alan-compact.chromium.pdf`, `margaret-two-column.chromium.pdf`, `ada-plain.quartz.pdf`, `ada-classic.textutil.docx`, `grace-stacked.textutil.docx`
- Create: `lib/resume-reader/pdf.ts`, `lib/resume-reader/file.ts`
- Test: `tests/unit/resume-reader/pdf.test.ts`, `tests/unit/resume-reader/file.test.ts`

**Interfaces:**
- Consumes: `linesFromItems` (Task 7), `MAX_RESUME_BYTES` from `lib/resume.ts`, `openPdf` (Task 6).
- Produces: `linesFromPdf: LinesFromPdf`, `MAX_PAGES = 10`, `checkResumeFile: CheckResumeFile`, `problemFromOpenError: ProblemFromOpenError`.
- A PDF with no text gives `lines: []`. Turning that into the `'noText'` problem is the caller's job, in Part B.

- [ ] **Step 1: Write the five sources**

Every word of content comes from `tests/unit/helpers/people.ts`. Use system fonts only; link nothing.

| File | Person | Layout |
| --- | --- | --- |
| `ada-classic.html` | `ada` | Name, then one contact line joined with ` \| `. Headings "Education", "Experience", "Projects", "Skills". Each job is one flex row: `Title, Company` on the left, `Jun 2026 – Aug 2026` on the right. Bullets are a `<ul>`. Education row: school left, `Expected May 2027` right, then `B.S. in Mathematics, GPA: 3.8/4.0`. Project row: `Name \| link`. |
| `grace-stacked.html` | `grace` | Name centred; `New York, NY` centred on its own line; then `email • phone • LinkedIn` centred. Headings in capitals: `EDUCATION`, `EXPERIENCE`, `PROJECTS`, `SKILLS`. Each job is two rows: company left with its town right (`Arlington, VA`, `Poughkeepsie, NY`), then title left with `June 2026 – August 2026` right. Bullets are plain paragraphs starting `- `. Education: school left, `Sep 2023 – May 2027` right, then `Bachelor of Arts in Computer Science`, then `GPA 3.9`. Skills on two lines: `Languages: COBOL, Python, Java` and `Tools: Git, Docker`. |
| `alan-compact.html` | `alan` | Name, then `email \| phone \| San Jose, CA \| GitHub`. Headings "Education", "Experience", "Technical Skills". Education: `B.S. Computer Science, King's College` left, `May 2026` right. The job on one line: `Research Assistant \| Bombe Labs \| Jan 2026 – May 2026`. Bullets are paragraphs starting `• `. |
| `margaret-two-column.html` | Margaret Hamilton, `margaretContact` | Two columns side by side at 35% and 65%. Left: name, email, phone, a "Skills" list of six items. Right: "Experience" with two jobs and six bullets, "Education". Invent the rest. |
| `ada-plain.txt` | `ada` | Plain text. Headings in capitals. Dates after at least four spaces on the job line. Bullets start `- `. |

- [ ] **Step 2: Write `scripts/make-resume-fixtures.mjs` and run it**

It prints each `src/*.html` to `<name>.chromium.pdf` with `chromium` from `@playwright/test` (`page.pdf({ format: 'Letter' })`), converts `ada-classic.html` and `grace-stacked.html` with `textutil -convert docx <src> -output <name>.textutil.docx`, and makes `ada-plain.quartz.pdf` with `cupsfilter -m application/pdf src/ada-plain.txt`. The last two are macOS tools; on any other system it says so and skips them, leaving the committed files in place.

Run: `node scripts/make-resume-fixtures.mjs && ls tests/fixtures/resumes`
Expected: the seven generated files listed above, each over 1 KB.

- [ ] **Step 3: Write the failing tests**

`tests/unit/resume-reader/pdf.test.ts`:

```ts
// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from 'vitest';
import { linesFromPdf } from '../../../lib/resume-reader/pdf';
import { openPdf } from '../helpers/pdf';

const file = (name: string) => new Uint8Array(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/resumes', name)));

test('a PDF printed by Chromium', async () => {
  const { lines, pagesRead, totalPages } = await linesFromPdf(await openPdf(file('ada-classic.chromium.pdf')));
  expect([pagesRead, totalPages]).toEqual([1, 1]);
  expect(lines[0]!.text).toBe('Ada Lovelace');
  expect(lines.map((l) => l.pieces)).toContainEqual(['Software Engineering Intern, Analytical Engines Ltd.', 'Jun 2026 – Aug 2026']);
  expect(lines.find((l) => l.text.startsWith('Built a punch-card'))!.indented).toBe(true);
});

test('a PDF written by macOS, one run per word', async () => {
  const { lines } = await linesFromPdf(await openPdf(file('ada-plain.quartz.pdf')));
  expect(lines[0]!.text).toBe('Ada Lovelace');
  expect(lines.map((l) => l.text)).toContain('EDUCATION');
});

test('only the first ten pages are read', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 12; n += 1) doc.addPage([612, 792]).drawText(`Page ${n}`, { x: 54, y: 700, size: 12, font });
  const { lines, pagesRead, totalPages } = await linesFromPdf(await openPdf(await doc.save()));
  expect([pagesRead, totalPages]).toEqual([10, 12]);
  expect(lines.map((l) => l.text)).toEqual(Array.from({ length: 10 }, (_, i) => `Page ${i + 1}`));
});

test('a PDF with no text gives no lines', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  expect((await linesFromPdf(await openPdf(await doc.save()))).lines).toEqual([]);
});
```

`tests/unit/resume-reader/file.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { checkResumeFile, problemFromOpenError } from '../../../lib/resume-reader/file';

describe('checkResumeFile', () => {
  test.each([
    ['Ada.pdf', 1000, null],
    ['ADA.PDF', 1000, null],
    ['Ada Lovelace.docx', 1000, null],
    ['Ada.pdf', 4 * 1024 * 1024, null],
    ['Ada.pdf', 4 * 1024 * 1024 + 1, 'tooLarge'],
    ['Ada.pdf', 0, 'empty'],
    ['Ada.doc', 1000, 'unsupportedType'],
    ['Ada.txt', 1000, 'unsupportedType'],
    ['Ada.pdf.exe', 1000, 'unsupportedType'],
    ['Ada', 1000, 'unsupportedType'],
  ])('%s (%i bytes) → %j', (name, size, expected) => {
    expect(checkResumeFile({ name, size })).toBe(expected);
  });
});

describe('problemFromOpenError', () => {
  test.each([
    [Object.assign(new Error('No password given'), { name: 'PasswordException' }), 'needsPassword'],
    [new Error('Invalid PDF structure.'), 'cannotOpen'],
    ['not an error', 'cannotOpen'],
    [null, 'cannotOpen'],
  ])('%j → %s', (error, expected) => {
    expect(problemFromOpenError(error)).toBe(expected);
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/pdf.test.ts tests/unit/resume-reader/file.test.ts`
Expected: FAIL, cannot resolve the two modules.

- [ ] **Step 5: Implement `lib/resume-reader/pdf.ts` and `lib/resume-reader/file.ts`**

- `linesFromPdf`: read pages 1 to `min(numPages, MAX_PAGES)`. Keep items that have a string `str` and a six-number `transform`. Each becomes a `TextItem` with `x = transform[4]`, `y = transform[5]`, `width`, and `size = height`, or `|transform[3]|` when the height is 0. Pass them all to `linesFromItems`. This file imports types only; it never imports `pdfjs-dist`.
- `checkResumeFile`: the extension after the last dot, lower-cased, must be `pdf` or `docx`; then size 0 is `'empty'`; then over `MAX_RESUME_BYTES` is `'tooLarge'`.
- `problemFromOpenError`: `'needsPassword'` when the value is an object whose `name` is `'PasswordException'`, else `'cannotOpen'`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/pdf.test.ts tests/unit/resume-reader/file.test.ts`
Expected: PASS.

- [ ] **Step 7: Checkpoint**

Commit message, if allowed: `feat: test résumés, and reading lines from a PDF`

---

### Task 9: Lines from a Word file

**Files:**
- Create: `lib/resume-reader/docx.ts`
- Test: `tests/unit/resume-reader/docx.test.ts`

**Interfaces:**
- Consumes: `normalizeText` (Task 7).
- Produces: `linesFromDocx: LinesFromDocx`.

- [ ] **Step 1: Write the failing tests**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { expect, test } from 'vitest';
import { linesFromDocx } from '../../../lib/resume-reader/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
/** A .docx holding only this body. */
const docx = (body: string) => zipSync({ 'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`) });
const p = (inner: string, props = '') => `<w:p><w:pPr>${props}</w:pPr>${inner}</w:p>`;
const r = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;

test('a Word file written by macOS', () => {
  const bytes = new Uint8Array(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/resumes/ada-classic.textutil.docx')));
  const lines = linesFromDocx(bytes);
  expect(lines[0]!.text).toBe('Ada Lovelace');
  expect(lines.map((l) => l.text)).toContain('Education');
  expect(lines.find((l) => l.text === 'Built a punch-card job scheduler in TypeScript.')).toMatchObject({ bullet: true, indented: true });
});

test('paragraphs, runs, tabs, breaks, lists and tables', () => {
  const lines = linesFromDocx(docx(
    p(r('Ada') + r(' Love') + r('lace')) +
    p(r('Software Engineering Intern') + '<w:r><w:tab/></w:r>' + r('Jun 2026 – Aug 2026')) +
    p(r('Built a scheduler.'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
    p(r('First line') + '<w:r><w:br/></w:r>' + r('Second line')) +
    p('') +
    `<w:tbl><w:tr><w:tc>${p(r('Left cell'))}</w:tc><w:tc>${p(r('Right &amp; last'))}</w:tc></w:tr></w:tbl>` +
    p(r('Indented'), '<w:ind w:left="720"/>'),
  ));
  expect(lines.map((l) => [l.pieces, l.bullet, l.indented])).toEqual([
    [['Ada Lovelace'], false, false],
    [['Software Engineering Intern', 'Jun 2026 – Aug 2026'], false, false],
    [['Built a scheduler.'], true, true],
    [['First line'], false, false],
    [['Second line'], false, false],
    [['Left cell'], false, false],
    [['Right & last'], false, false],
    [['Indented'], false, true],
  ]);
  expect(lines.every((l) => l.page === 1 && l.fullWidth === false)).toBe(true);
});

test('bytes that are not a .docx are refused', () => {
  expect(() => linesFromDocx(strToU8('%PDF-1.7'))).toThrow();
  expect(() => linesFromDocx(zipSync({ 'hello.txt': strToU8('hi') }))).toThrow();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/docx.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/docx`.

- [ ] **Step 3: Implement `linesFromDocx` in `lib/resume-reader/docx.ts`**

Unzip only `word/document.xml` with `unzipSync` and its `filter` option, decode with `strFromU8`, and parse with `new DOMParser().parseFromString(xml, 'application/xml')`. Walk every `w:p` in document order by namespace, tables included. Within a paragraph, `w:t` is text, `w:tab` starts a new piece, and `w:br` ends the line and starts another. Drop empty pieces and empty lines. A paragraph with `w:numPr`, or whose first piece is only a bullet mark from Task 7's list, is a bullet with the mark removed. `indented` is true for a bullet or for a `w:ind` whose `w:left` or `w:start` is above 0. `x` is 18 when indented, else 0; `pieceX` is `x + 200 × index`; `page` is 1; `fullWidth` is false. Normalise every piece.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/docx.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: read lines from a Word file`

---

### Task 10: Sections

**Files:**
- Create: `lib/resume-reader/sections.ts`
- Test: `tests/unit/resume-reader/sections.test.ts`

**Interfaces:**
- Produces: `splitSections: SplitSections`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { splitSections } from '../../../lib/resume-reader/sections';
import { bullet, line } from './helpers';

const kinds = (...texts: (string | string[])[]) => splitSections(texts.map((t) => line(t))).map((s) => [s.kind, s.heading, s.lines.map((l) => l.text)]);

test('lines before the first heading are the header; each heading opens a section', () => {
  expect(kinds('Ada Lovelace', 'ada@example.com', 'Education', 'University of London', 'Work Experience:', 'Tutor', 'Skills & Tools', 'Python')).toEqual([
    ['header', '', ['Ada Lovelace', 'ada@example.com']],
    ['education', 'Education', ['University of London']],
    ['experience', 'Work Experience:', ['Tutor']],
    ['skills', 'Skills & Tools', ['Python']],
  ]);
});

describe('what is a heading', () => {
  test.each([
    ['EDUCATION', 'education'],
    ['Academic Background', 'education'],
    ['Professional Experience', 'experience'],
    ['Employment History', 'experience'],
    ['Personal Projects', 'projects'],
    ['TECHNICAL SKILLS', 'skills'],
    ['Summary', 'other'],
    ['Honors & Awards', 'other'],
    ['Leadership and Activities', 'other'],
    ['Relevant Coursework', 'other'],
  ])('%s → %s', (text, kind) => {
    expect(kinds('Ada Lovelace', text, 'x')[1]).toEqual([kind, text, ['x']]);
  });

  test.each([
    'Education is the most powerful tool',
    'Experience with Python and SQL',
    'Skills: Python, SQL',
    'B.S.',
    'GPA: 3.8',
  ])('%s is not one', (text) => {
    expect(kinds('Ada Lovelace', text)).toEqual([['header', '', ['Ada Lovelace', text]]]);
  });

  test('a bullet or a line with two pieces is never a heading', () => {
    expect(splitSections([line('Ada Lovelace'), bullet('Skills'), line(['Experience', 'Jun 2026 – Aug 2026'])]).length).toBe(1);
  });

  test('an unknown heading in capitals counts only in a résumé whose known headings are in capitals', () => {
    expect(kinds('Ada Lovelace', 'EDUCATION', 'Vassar College', 'HACKATHONS', 'HackNY winner')[2]).toEqual(['other', 'HACKATHONS', ['HackNY winner']]);
    expect(kinds('Ada Lovelace', 'Education', 'Vassar College', 'HACKATHONS', 'HackNY winner').length).toBe(2);
    expect(kinds('Ada Lovelace', 'EDUCATION', 'IBM', 'B.S. 2027').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/sections.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/sections`.

- [ ] **Step 3: Implement `splitSections` in `lib/resume-reader/sections.ts`**

A heading is a line that is not a bullet, has one piece, and whose text, lower-cased, with one trailing colon removed and `&` read as `and`, is in this table:

| Kind | Headings |
| --- | --- |
| education | education, academic background, education and training |
| experience | experience, work experience, professional experience, relevant experience, employment, employment history, work history, internships, internship experience |
| projects | projects, personal projects, academic projects, selected projects, technical projects, side projects |
| skills | skills, technical skills, skills and tools, core skills, key skills, technologies, tools and technologies |
| other | summary, professional summary, objective, profile, about me, awards, honors, honors and awards, awards and honors, activities, leadership, leadership and activities, extracurricular activities, volunteer experience, volunteering, certifications, publications, coursework, relevant coursework, interests, languages, references |

One more rule, used only when at least one table heading in the file is written entirely in capitals: a non-bullet, one-piece line of one to four words, all capital letters, spaces and `&`, with at least four letters, is a heading of kind `other`.

The first section is always the header, even when it has no lines.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: split a résumé into sections`

---

### Task 11: Contact details

**Files:**
- Create: `lib/resume-reader/contact.ts`
- Test: `tests/unit/resume-reader/contact.test.ts`

**Interfaces:**
- Produces: `readContact: ReadContact`. It returns only the nine contact fields, and only those it found.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { readContact } from '../../../lib/resume-reader/contact';
import { line } from './helpers';

const read = (...texts: string[]) => {
  const { values, leftovers } = readContact(texts.map((t) => line(t)));
  return { values, leftovers };
};

test('one line of contact details separated by bars', () => {
  expect(read('Ada Lovelace', 'Palo Alto, CA | ada@example.com | (415) 555-0100 | linkedin.com/in/ada-example | github.com/ada-example')).toEqual({
    values: {
      firstName: 'Ada', lastName: 'Lovelace', city: 'Palo Alto', state: 'CA', email: 'ada@example.com',
      phone: '(415) 555-0100', linkedin: 'linkedin.com/in/ada-example', github: 'github.com/ada-example',
    },
    leftovers: {},
  });
});

test('details spread over several lines, separated by dots', () => {
  expect(read('Grace Hopper', 'New York, NY', 'grace@example.com • (212) 555-0142 • linkedin.com/in/grace-example').values).toEqual({
    firstName: 'Grace', lastName: 'Hopper', city: 'New York', state: 'NY', email: 'grace@example.com',
    phone: '(212) 555-0142', linkedin: 'linkedin.com/in/grace-example',
  });
});

describe('each field', () => {
  test.each([
    ['Email: ada@example.com', { email: 'ada@example.com' }],
    ['+1 415-555-0100', { phone: '+1 415-555-0100' }],
    ['415.555.0100', { phone: '415.555.0100' }],
    ['https://www.linkedin.com/in/ada-example/', { linkedin: 'https://www.linkedin.com/in/ada-example/' }],
    ['https://ada.example.com', { portfolio: 'https://ada.example.com' }],
    ['www.ada-example.dev', { portfolio: 'www.ada-example.dev' }],
    ['Brooklyn, New York', { city: 'Brooklyn', state: 'New York' }],
    ['San Jose, CA 95112', { city: 'San Jose', state: 'CA' }],
    // must not match
    ['ada@example', {}],
    ['555-0100', {}],
    ['2026 – 2027', {}],
    ['Node.js and React', {}],
    ['linkedin.com/company/analytical-engines', {}],
    ['github.com/ada-example/bernoulli', {}],
    ['US citizen, authorized to work', {}],
  ])('%s', (text, expected) => {
    expect(read('Ada Lovelace', text).values).toEqual({ firstName: 'Ada', lastName: 'Lovelace', ...expected });
  });
});

test('a name that is not exactly two words is left for the person, with the text shown', () => {
  expect(read('Ada King Lovelace', 'ada@example.com')).toEqual({ values: { email: 'ada@example.com' }, leftovers: { firstName: 'Ada King Lovelace' } });
  expect(read('ADA LOVELACE').values).toEqual({ firstName: 'ADA', lastName: 'LOVELACE' });
  expect(read('Curriculum Vitae 2026').values).toEqual({});
});

test('a town that is not in a US state is left for the person, with the text shown', () => {
  expect(read('Ada Lovelace', 'London, UK | ada@example.com').leftovers).toEqual({ city: 'London, UK' });
});

test('only lines something was taken from are reported as used', () => {
  const lines = [line('Ada Lovelace'), line('Open to relocation'), line('ada@example.com')];
  expect(readContact(lines).used).toEqual([lines[0], lines[2]]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/contact.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/contact`.

- [ ] **Step 3: Implement `readContact` in `lib/resume-reader/contact.ts`**

Split each line into parts at its pieces and at `|`, `•`, `·` and `●`. For each field the first match wins.

- Email: `name@host.tld` found inside a part.
- Phone: a run of digits, spaces, `( ) . -` and an optional leading `+`, holding 10 to 15 digits. Keep it as written.
- LinkedIn: `linkedin.com/in/<name>`, with or without `https://`, `www.` and a final slash. GitHub: `github.com/<name>` with nothing after the name but an optional slash. Keep both as written.
- Personal site: a part that is a web address (it starts with `http://`, `https://` or `www.`), is not LinkedIn or GitHub and holds no `@`.
- City and state: a part of the form `Town, ST` or `Town, ST 12345` where `ST` is a two-letter US state code (the fifty states and DC), or `Town, State` where `State` is one of their full names. A part of the form `Words, Words` that fails this goes to `leftovers.city`.
- Name: only the first line is considered. If it is exactly two words made of letters, apostrophes, hyphens and full stops, they are the first and last name, as written. Otherwise, if it has no digits and no `@` and is two to five words long, it goes to `leftovers.firstName`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/contact.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: read contact details from a résumé header`

---

### Task 12: Education

**Files:**
- Create: `lib/resume-reader/education.ts`
- Test: `tests/unit/resume-reader/education.test.ts`

**Interfaces:**
- Consumes: `parseMonth`, `parseDateRange` (Task 2).
- Produces: `readEducation: ReadEducation`. It returns only `school`, `degree`, `major`, `graduationDate`, `gpa`, and only those it found.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { readEducation } from '../../../lib/resume-reader/education';
import type { TextLine } from '../../../lib/types';
import { line } from './helpers';

const read = (lines: TextLine[]) => {
  const { values, leftovers } = readEducation(lines);
  return { values, leftovers };
};

describe('whole entries', () => {
  test.each([
    [
      'school with the month at the right',
      [line(['University of London', 'Expected May 2027']), line('B.S. in Mathematics, GPA: 3.8/4.0')],
      { school: 'University of London', degree: 'B.S.', major: 'Mathematics', graduationDate: '2027-05', gpa: '3.8' },
    ],
    [
      'a date range, the town after the school, the GPA on its own line',
      [line(['Vassar College, Poughkeepsie, NY', 'Sep 2023 – May 2027']), line('Bachelor of Arts in Computer Science'), line('GPA 3.9')],
      { school: 'Vassar College', degree: 'Bachelor of Arts', major: 'Computer Science', graduationDate: '2027-05', gpa: '3.9' },
    ],
    [
      'degree before the school on one line',
      [line(["B.S. Computer Science, King's College", 'May 2026'])],
      { school: "King's College", degree: 'B.S.', major: 'Computer Science', graduationDate: '2026-05' },
    ],
    [
      'a dated line of its own',
      [line('Stanford University'), line('Master of Science, Electrical Engineering'), line('June 2028')],
      { school: 'Stanford University', degree: 'Master of Science', major: 'Electrical Engineering', graduationDate: '2028-06' },
    ],
  ])('%s', (_name, lines, values) => {
    expect(read(lines)).toEqual({ values, leftovers: {} });
  });
});

test('a year with no month is not a graduation month; the text is shown instead', () => {
  expect(read([line('Stanford University'), line('B.S. in Physics'), line('Class of 2027')])).toEqual({
    values: { school: 'Stanford University', degree: 'B.S.', major: 'Physics' },
    leftovers: { graduationDate: 'Class of 2027' },
  });
});

describe('GPA', () => {
  test.each([
    ['GPA: 3.8/4.0', '3.8'],
    ['GPA 3.85', '3.85'],
    ['3.8 GPA', '3.8'],
    ['Cumulative GPA: 4.0', '4.0'],
  ])('%s → %s', (text, gpa) => {
    expect(read([line('Vassar College'), line(text)]).values.gpa).toBe(gpa);
  });
  test.each(['Top 3.8% of the class', 'GPA: 38', 'Version 3.8'])('%s is not one', (text) => {
    expect(read([line('Vassar College'), line(text)]).values.gpa).toBeUndefined();
  });
});

test('things that are not a major', () => {
  expect(read([line('Vassar College'), line('B.A., 2027')]).values.major).toBeUndefined();
  expect(read([line('Vassar College'), line('Relevant coursework: Linear Algebra, Statistics')]).values).toEqual({ school: 'Vassar College' });
});

test('only the first school is read; the lines of a second one are not used', () => {
  const lines = [line(['Vassar College', 'May 2027']), line('B.A. in Mathematics'), line(['City College of New York', 'May 2023']), line('A.S. in Science')];
  const reading = readEducation(lines);
  expect(reading.values).toEqual({ school: 'Vassar College', degree: 'B.A.', major: 'Mathematics', graduationDate: '2027-05' });
  expect(reading.used).toEqual([lines[0], lines[1]]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/education.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/education`.

- [ ] **Step 3: Implement `readEducation` in `lib/resume-reader/education.ts`**

- The entry runs from the first line that names a school to just before the next line that names one. A school is named by the word University, College, Institute, School, Academy or Polytechnic.
- School: the comma-separated part that holds that word, together with what precedes it in the same piece when that is not a degree. A trailing `, Town, ST` with a US state code is dropped.
- Degree, as written, matched as a whole phrase: `Bachelor of …`, `Master of …`, `Associate of …`, `Doctor of …` (up to three further words), `B.S.`, `B.A.`, `B.Sc.`, `B.Eng.`, `B.E.`, `M.S.`, `M.A.`, `M.Sc.`, `M.Eng.`, `A.S.`, `A.A.`, `Ph.D.`, and the unpunctuated `BS`, `BA`, `BSc`, `MS`, `MA`, `MSc`, `MBA`, `PhD` in capitals as written.
- Major: the words after the degree, introduced by `in`, by a comma, or directly, up to the next comma, bar, bracket, dash or the word GPA. It must start with a capital letter, hold no digits and be at most six words.
- Graduation month: from a piece or a line in the entry that `isDateText` accepts. A range gives its end. A bare year goes to `leftovers.graduationDate`.
- GPA: a number from 0.0 to 4.99 with one or two decimals, directly after `GPA` (optional colon) or directly before it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/education.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: read education from a résumé`

---

### Task 13: Jobs

**Files:**
- Create: `lib/resume-reader/jobs.ts`
- Test: `tests/unit/resume-reader/jobs.test.ts`

**Interfaces:**
- Consumes: `parseDateRange`, `isDateText` (Task 2).
- Produces: `readJobs: ReadJobs`, and the exported word lists `ROLE_WORDS` and `ORGANISATION_WORDS`. Ids are `job-1`, `job-2`, … in file order.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { readJobs } from '../../../lib/resume-reader/jobs';
import type { DraftJob, TextLine } from '../../../lib/types';
import { bullet, line } from './helpers';

const job = (fields: Partial<DraftJob>): DraftJob => ({ id: 'job-1', title: '', company: '', start: '', end: '', current: false, lines: [], leftover: '', ...fields });
const summer = { start: '2026-06', end: '2026-08' };

describe('one job', () => {
  test.each<[string, TextLine[], Partial<DraftJob>]>([
    [
      'title, company and dates on one line',
      [line(['Software Engineering Intern, Analytical Engines Ltd.', 'Jun 2026 – Aug 2026']), bullet('Built a scheduler.'), bullet('Wrote tests.')],
      { title: 'Software Engineering Intern', company: 'Analytical Engines Ltd.', ...summer, lines: ['Built a scheduler.', 'Wrote tests.'] },
    ],
    [
      'title with dates, company on the next line',
      [line(['Mathematics Tutor', 'Sep 2025 – Present']), line('University of London'), bullet('Tutored 12 students.')],
      { title: 'Mathematics Tutor', company: 'University of London', start: '2025-09', current: true, lines: ['Tutored 12 students.'] },
    ],
    [
      'company with its town, then title with dates',
      [line(['Compiler Works Inc.', 'Arlington, VA']), line(['Software Developer Intern', 'June 2026 – August 2026']), bullet('Wrote a linker.')],
      { title: 'Software Developer Intern', company: 'Compiler Works Inc.', ...summer, lines: ['Wrote a linker.'], leftover: 'Arlington, VA' },
    ],
    [
      'everything in one piece, separated by bars',
      [line('Research Assistant | Bombe Labs | Jan 2026 – May 2026'), bullet('Automated 3 reports.')],
      { title: 'Research Assistant', company: 'Bombe Labs', start: '2026-01', end: '2026-05', lines: ['Automated 3 reports.'] },
    ],
    [
      '"at" settles it without any other evidence',
      [line(['Barista at Blue Bottle', 'May 2024 – Aug 2024'])],
      { title: 'Barista', company: 'Blue Bottle', start: '2024-05', end: '2024-08' },
    ],
    [
      'dates on a line of their own, as a Word file gives them',
      [line('Teaching Assistant, Vassar College'), line('Sep 2025 – Present'), bullet('Ran lab sessions.')],
      { title: 'Teaching Assistant', company: 'Vassar College', start: '2025-09', current: true, lines: ['Ran lab sessions.'] },
    ],
    [
      'nothing settles which is the title: both stay blank and the text is kept',
      [line(['Phoenix, Atlas', 'Jan 2026 – Mar 2026']), bullet('Shipped it.')],
      { start: '2026-01', end: '2026-03', lines: ['Shipped it.'], leftover: 'Phoenix, Atlas' },
    ],
    [
      'both halves look like employers: both stay blank',
      [line(['Acme Inc., Globex Corp.', 'Jan 2026 – Mar 2026'])],
      { start: '2026-01', end: '2026-03', leftover: 'Acme Inc., Globex Corp.' },
    ],
    [
      'years without months: the dates stay blank and the text is kept',
      [line(['Research Assistant, De Morgan Lab', '2024 – 2025']), bullet('Ran experiments.')],
      { title: 'Research Assistant', company: 'De Morgan Lab', lines: ['Ran experiments.'], leftover: '2024 – 2025' },
    ],
    [
      'a title alone',
      [line(['Freelance Developer', 'Jan 2026 – Mar 2026'])],
      { title: 'Freelance Developer', start: '2026-01', end: '2026-03' },
    ],
  ])('%s', (_name, lines, expected) => {
    expect(readJobs(lines).jobs).toEqual([job(expected)]);
  });
});

test('two jobs, numbered in the order they appear', () => {
  const { jobs } = readJobs([
    line(['Software Engineering Intern, Analytical Engines Ltd.', 'Jun 2026 – Aug 2026']), bullet('Built a scheduler.'),
    line(['Mathematics Tutor, University of London', 'Sep 2025 – Present']), bullet('Tutored students.'),
  ]);
  expect(jobs.map((j) => [j.id, j.title])).toEqual([['job-1', 'Software Engineering Intern'], ['job-2', 'Mathematics Tutor']]);
});

describe('description lines', () => {
  const head = line(['Tutor, Vassar College', 'Sep 2025 – Present']);
  const plain = (text: string, fullWidth: boolean) => line(text, { x: 70, pieceX: [70], indented: true, fullWidth });

  test('with bullet marks, an unmarked line continues the bullet above', () => {
    expect(readJobs([head, bullet('Tutored 12 first-year students in calculus and'), plain('linear algebra each term.', false), bullet('Wrote practice sets.')]).jobs[0]!.lines)
      .toEqual(['Tutored 12 first-year students in calculus and linear algebra each term.', 'Wrote practice sets.']);
  });

  test('with no marks at all, a line continues the one above only when that one ran to the margin', () => {
    expect(readJobs([head, plain('Tutored 12 first-year students in calculus and', true), plain('linear algebra each term.', false), plain('Wrote practice sets.', false)]).jobs[0]!.lines)
      .toEqual(['Tutored 12 first-year students in calculus and linear algebra each term.', 'Wrote practice sets.']);
  });

  test('a date range inside a bullet does not start a job', () => {
    expect(readJobs([head, bullet('Shipped version 2 between Jun 2026 – Aug 2026.')]).jobs.length).toBe(1);
  });
});

test('a line with no dates and no description under it is not a job, and is not used', () => {
  const lines = [line(['Tutor, Vassar College', 'Sep 2025 – Present']), bullet('Tutored students.'), line('References available on request')];
  const { jobs, used } = readJobs(lines);
  expect(jobs.length).toBe(1);
  expect(used).toEqual([lines[0], lines[1]]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/jobs.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/jobs`.

- [ ] **Step 3: Implement `readJobs` in `lib/resume-reader/jobs.ts`**

Word lists, matched on whole lower-cased words with a trailing comma removed:

```ts
export const ROLE_WORDS: readonly string[] = [
  'intern', 'engineer', 'developer', 'programmer', 'analyst', 'manager', 'assistant', 'tutor', 'researcher',
  'designer', 'associate', 'consultant', 'specialist', 'coordinator', 'lead', 'director', 'officer', 'technician',
  'administrator', 'scientist', 'teacher', 'instructor', 'fellow', 'representative', 'cashier', 'barista', 'server',
  'clerk', 'president', 'founder', 'architect', 'advisor', 'mentor', 'volunteer', 'editor', 'writer', 'accountant',
  'nurse', 'supervisor', 'captain', 'treasurer', 'secretary', 'ambassador', 'apprentice', 'trainee', 'contractor',
];
export const ORGANISATION_WORDS: readonly string[] = [
  'inc', 'inc.', 'llc', 'ltd', 'ltd.', 'corp', 'corp.', 'corporation', 'company', 'co.', 'university', 'college',
  'institute', 'labs', 'lab', 'laboratory', 'technologies', 'systems', 'solutions', 'group', 'bank', 'hospital',
  'school', 'studio', 'studios', 'foundation', 'department', 'agency', 'club', 'society', 'association', 'partners',
  'holdings', 'industries', 'works', 'library', 'center', 'centre', 'clinic', 'council', 'committee',
];
```

Splitting into jobs:
- A description line is one that is a bullet or is indented. Every other line is a header line.
- A job is a run of header lines followed by its description lines. Within a run of header lines, a second line holding a date range starts a new job.
- A run of header lines with no date-like text and no description lines under it is not a job. Its lines are not used.

Description lines, in order: a marked bullet starts a new entry. An unmarked line continues the entry above when the job has any marked bullet, or, when it has none, when the line above is `fullWidth`. Otherwise it starts a new entry.

Reading the header:
- Break the header lines into parts at pieces and at ` | `. A part `isDateText` accepts is the dates: `parseDateRange` fills start, end and current; if it cannot, the part goes to `leftover`.
- A part of the form `Town, ST` or `Town, Country` with no role word and no organisation word goes to `leftover`.
- What remains is one or two candidates. One part is split in two at ` at `, ` @ `, `, `, ` — `, ` – ` or ` - `. For a comma, try each comma as the split point and keep the split only if exactly one gives a decision below.
- `X at Y` and `X @ Y`: X is the title, Y the company.
- Otherwise, with two candidates: if exactly one holds a role word and that one holds no organisation word, it is the title and the other is the company. Failing that, if exactly one holds an organisation word and that one holds no role word, it is the company and the other is the title. Failing both, title and company stay blank and the text goes to `leftover`.
- With one candidate: a role word and no organisation word makes it the title; an organisation word and no role word makes it the company; anything else goes to `leftover`.
- Several leftovers are joined with ` | `.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: read jobs from a résumé`

---

### Task 14: Projects and skills

**Files:**
- Create: `lib/resume-reader/projects.ts`, `lib/resume-reader/skills.ts`
- Test: `tests/unit/resume-reader/projects.test.ts`, `tests/unit/resume-reader/skills.test.ts`

**Interfaces:**
- Produces: `readProjects: ReadProjects` (ids `project-1`, `project-2`, …), `readSkills: ReadSkills`. `extra` is text from a used line that fits no field; the caller adds it to `unused`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/resume-reader/projects.test.ts`:

```ts
import { expect, test } from 'vitest';
import { readProjects } from '../../../lib/resume-reader/projects';
import { bullet, line } from './helpers';

test('name, link and description', () => {
  expect(readProjects([
    line('Bernoulli Numbers Calculator | github.com/ada-example/bernoulli'),
    bullet('A Python program that computes Bernoulli numbers.'),
    line('FLOW-MATIC Notes'),
    bullet('A study guide.'),
    bullet('Used by two classes.'),
  ])).toMatchObject({
    projects: [
      { id: 'project-1', name: 'Bernoulli Numbers Calculator', link: 'github.com/ada-example/bernoulli', lines: ['A Python program that computes Bernoulli numbers.'] },
      { id: 'project-2', name: 'FLOW-MATIC Notes', link: '', lines: ['A study guide.', 'Used by two classes.'] },
    ],
    extra: [],
  });
});

test('whatever else is on the name line is kept as extra, not dropped', () => {
  expect(readProjects([line(['Chess Engine — Python, NumPy', 'Jan 2026 – Mar 2026']), bullet('Plays at club level.')])).toMatchObject({
    projects: [{ id: 'project-1', name: 'Chess Engine', link: '', lines: ['Plays at club level.'] }],
    extra: ['Python, NumPy', 'Jan 2026 – Mar 2026'],
  });
});

test('a bullet never starts a project', () => {
  expect(readProjects([bullet('Stray line')]).projects).toEqual([]);
});
```

`tests/unit/resume-reader/skills.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { readSkills } from '../../../lib/resume-reader/skills';
import type { TextLine } from '../../../lib/types';
import { bullet, line } from './helpers';

describe('skills', () => {
  test.each<[string, TextLine[], string[], string[]]>([
    ['one comma list', [line('Python, TypeScript, SQL, Git, Linear algebra')], ['Python', 'TypeScript', 'SQL', 'Git', 'Linear algebra'], []],
    ['labelled lines', [line('Languages: COBOL, Python, Java'), line('Tools: Git; Docker')], ['COBOL', 'Python', 'Java', 'Git', 'Docker'], []],
    ['bullets, bars and dots', [bullet('Python | SQL'), bullet('Git • Docker')], ['Python', 'SQL', 'Git', 'Docker'], []],
    ['the same skill twice is kept once, as first written', [line('Python, python, SQL, PYTHON')], ['Python', 'SQL'], []],
    ['a sentence is not a skill', [line('Python, SQL'), line('I enjoy solving hard problems with elegant code')], ['Python', 'SQL'], ['I enjoy solving hard problems with elegant code']],
    ['C++, C# and .NET survive', [line('C++, C#, .NET, Node.js')], ['C++', 'C#', '.NET', 'Node.js'], []],
  ])('%s', (_name, lines, skills, extra) => {
    expect(readSkills(lines)).toMatchObject({ skills, extra });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/projects.test.ts tests/unit/resume-reader/skills.test.ts`
Expected: FAIL, cannot resolve the two modules.

- [ ] **Step 3: Implement `readProjects` and `readSkills`**

- `readProjects`: a line that is neither a bullet nor indented starts a project. Break it into parts at pieces and at ` | `, ` — `, ` – ` and `: `. The first part is the name. The first part that is a web address (`http://`, `https://`, `www.`, or `host.tld/path`) is the link. Every other part goes to `extra`. Bullets and indented lines under it are its description, joined by the rules of Task 13.
- `readSkills`: for each line, drop a leading label of one to three words that ends in a colon, then split at commas, semicolons, bars, `•` and `·`. Trim each item. An item of more than four words goes to `extra`. Drop repeats without regard to case, keeping the first.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/projects.test.ts tests/unit/resume-reader/skills.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: read projects and skills from a résumé`

---

### Task 15: The whole read

**Files:**
- Create: `lib/resume-reader/read.ts`
- Test: `tests/unit/resume-reader/read.test.ts`

**Interfaces:**
- Consumes: `splitSections` (Task 10), `readContact` (11), `readEducation` (12), `readJobs` (13), `readProjects`, `readSkills` (14), `isDateText` (2).
- Produces: `readResume: ReadResume`, `looksLikeColumns: LooksLikeColumns`.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest';
import { looksLikeColumns, readResume } from '../../../lib/resume-reader/read';
import { ada } from '../helpers/people';
import { bullet, line } from './helpers';

const adaLines = [
  line('Ada Lovelace'),
  line('Palo Alto, CA | ada@example.com | (415) 555-0100 | linkedin.com/in/ada-example | github.com/ada-example'),
  line('US citizen, authorized to work without sponsorship'),
  line('Education'),
  line(['University of London', 'Expected May 2027']),
  line('B.S. in Mathematics, GPA: 3.8/4.0'),
  line('Experience'),
  line(['Software Engineering Intern, Analytical Engines Ltd.', 'Jun 2026 – Aug 2026']),
  bullet('Built a punch-card job scheduler in TypeScript.'),
  bullet('Wrote tests for the calculation engine and fixed 14 reported defects.'),
  line(['Mathematics Tutor, University of London', 'Sep 2025 – Present']),
  bullet('Tutored 12 first-year students in calculus and linear algebra each term.'),
  line('Projects'),
  line('Bernoulli Numbers Calculator | github.com/ada-example/bernoulli'),
  bullet('A Python program that computes Bernoulli numbers step by step, with tests.'),
  line('Skills'),
  line('Python, TypeScript, SQL, Git, Linear algebra'),
  line('Awards'),
  line('Royal Society Medal, 2026'),
];

test('a single-column résumé becomes a complete draft', () => {
  expect(readResume(adaLines)).toEqual({
    profile: {
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '(415) 555-0100',
      city: 'Palo Alto', state: 'CA',
      linkedin: 'linkedin.com/in/ada-example', github: 'github.com/ada-example', portfolio: '',
      school: 'University of London', degree: 'B.S.', major: 'Mathematics', graduationDate: '2027-05', gpa: '3.8',
    },
    leftovers: {},
    jobs: ada.work.jobs.map((job) => ({ ...job, leftover: '' })),
    projects: ada.work.projects,
    skills: ada.work.skills,
    unused: ['US citizen, authorized to work without sponsorship', 'Awards', 'Royal Society Medal, 2026'],
    layout: 'single',
  });
});

test('the draft has no place for work authorization, sponsorship or any demographic answer', () => {
  expect(Object.keys(readResume(adaLines).profile).sort()).toEqual([
    'city', 'degree', 'email', 'firstName', 'github', 'gpa', 'graduationDate', 'lastName',
    'linkedin', 'major', 'phone', 'portfolio', 'school', 'state',
  ]);
});

test('nothing at all still gives a whole, empty draft', () => {
  const draft = readResume([]);
  expect(Object.values(draft.profile).every((value) => value === '')).toBe(true);
  expect([draft.jobs, draft.projects, draft.skills, draft.unused, draft.layout]).toEqual([[], [], [], [], 'single']);
});

const twoColumns = [
  line('Margaret Hamilton'),
  line(['margaret@example.com', 'Experience'], { pieceX: [40, 250] }),
  line(['(617) 555-0163', 'Lead Developer, Apollo Software Ltd.'], { pieceX: [40, 250] }),
  line(['Skills', 'Led the team that wrote the flight software.'], { pieceX: [40, 252] }),
  line(['Assembly', 'Designed priority scheduling for the computer.'], { pieceX: [40, 250] }),
  line(['Systems design', 'Education'], { pieceX: [40, 251] }),
  line(['Testing', 'Earlham College, B.A. in Mathematics'], { pieceX: [40, 250] }),
];

test('a résumé in columns is recognised', () => {
  expect(looksLikeColumns(twoColumns)).toBe(true);
  expect(looksLikeColumns(adaLines)).toBe(false);
  // Dates at the right are not a second column.
  expect(looksLikeColumns(Array.from({ length: 8 }, () => line(['Tutor, Vassar College', 'Sep 2025 – Present'])))).toBe(false);
});

test('from a résumé in columns only pattern-matched contact details are read; the rest is handed back', () => {
  const draft = readResume(twoColumns);
  expect(draft.layout).toBe('columns');
  expect(draft.profile).toMatchObject({ email: 'margaret@example.com', phone: '(617) 555-0163', firstName: '', lastName: '', school: '' });
  expect([draft.jobs, draft.projects, draft.skills]).toEqual([[], [], []]);
  expect(draft.unused).toContain('Lead Developer, Apollo Software Ltd.');
  expect(draft.unused).toContain('Assembly');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/read.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/read`.

- [ ] **Step 3: Implement `looksLikeColumns` and `readResume` in `lib/resume-reader/read.ts`**

- `looksLikeColumns`: take the lines with two or more pieces whose last piece `isDateText` rejects. True when there are at least five and at least five of their second pieces start within 8 of the median of those starts.
- `readResume`, single column: split into sections. The header goes to `readContact`; the first education section to `readEducation`; all experience sections together to `readJobs`; all projects sections to `readProjects`; all skills sections to `readSkills`. `profile` holds all fourteen fields, `''` where nothing was found. `unused`, in reading order: every line no reader reported as used, the heading and lines of every `other` section and of any second education section, and each reader's `extra` at the place of the line it came from.
- `readResume`, columns: `layout` is `'columns'`. Look for an email, a phone number, a LinkedIn address and a GitHub address in every piece of every line, by Task 11's patterns. Everything else in `profile` is `''`, the three lists are empty, and `unused` is every piece of every line that was not taken, in reading order.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/read.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: read a whole résumé into a draft`

---

### Task 16: A second upload

**Files:**
- Create: `lib/resume-reader/apply.ts`
- Test: `tests/unit/resume-reader/apply.test.ts`

**Interfaces:**
- Produces: `applyDraft: ApplyDraft`. Its result is what the check screen starts from. For a first upload, `saved` is an empty profile and `emptyWorkHistory()`.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest';
import { applyDraft } from '../../../lib/resume-reader/apply';
import type { ImportDraft, ResumeDetails } from '../../../lib/types';
import { ada, blankProfile, grace } from '../helpers/people';

const draftOf = (details: ResumeDetails, changes: Partial<ImportDraft> = {}): ImportDraft => {
  const { firstName, lastName, email, phone, city, state, linkedin, github, portfolio, school, degree, major, graduationDate, gpa } = details.profile;
  return {
    profile: { firstName, lastName, email, phone, city, state, linkedin, github, portfolio, school, degree, major, graduationDate, gpa },
    leftovers: {},
    jobs: details.work.jobs.map((job) => ({ ...job, leftover: 'kept out of the result' })),
    projects: details.work.projects,
    skills: details.work.skills,
    unused: [],
    layout: 'single',
    ...changes,
  };
};

test('a first upload fills an empty profile', () => {
  const result = applyDraft({ profile: blankProfile(), work: { jobs: [], projects: [], skills: [] } }, draftOf(ada));
  expect(result).toEqual(ada);
});

test('a second upload: lists are replaced whole, answers change only where the file has one', () => {
  const saved: ResumeDetails = {
    profile: {
      ...ada.profile,
      addressLine1: '12 Engine Row', postalCode: '94301', country: 'United States',
      portfolio: 'https://ada.example.com', workAuthorization: 'yes', sponsorship: 'no', gender: 'decline',
      currentCompany: 'University of London', currentTitle: 'Mathematics Tutor',
    },
    work: ada.work,
  };
  const draft = draftOf(grace, { profile: { ...draftOf(grace).profile, github: '', portfolio: '', gpa: '' }, projects: [] });
  expect(applyDraft(saved, draft)).toEqual({
    profile: {
      ...saved.profile,
      firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', phone: '(212) 555-0142',
      city: 'New York', state: 'NY', linkedin: 'linkedin.com/in/grace-example',
      school: 'Vassar College', degree: 'Bachelor of Arts', major: 'Computer Science', graduationDate: '2027-05',
      // not in the new file, so kept: github, portfolio, gpa
    },
    work: { jobs: grace.work.jobs, projects: ada.work.projects, skills: grace.work.skills },
  });
});

test('the saved details are not changed', () => {
  const saved: ResumeDetails = structuredClone(ada);
  applyDraft(saved, draftOf(grace));
  expect(saved).toEqual(ada);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/resume-reader/apply.test.ts`
Expected: FAIL, cannot resolve `../../../lib/resume-reader/apply`.

- [ ] **Step 3: Implement `applyDraft` in `lib/resume-reader/apply.ts`**

For each of the fourteen `ResumeProfileField`s, take the draft's value when it is not `''`, else keep the saved one. Leave every other `Profile` field as saved, `currentCompany` and `currentTitle` included. Take the draft's jobs when there is at least one, without `leftover`, else keep the saved jobs. The same for projects and for skills.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/resume-reader/apply.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Commit message, if allowed: `feat: apply a résumé draft to saved details`

---

### Task 17: Accuracy on the test résumés, and the round trip

**Files:**
- Test: `tests/unit/resume-reader/accuracy.test.ts`
- Test: `tests/unit/resume-reader/accuracy-docx.test.ts`
- Test: `tests/unit/resume-builder/round-trip.test.ts`

**Interfaces:**
- Consumes: `linesFromPdf` (Task 8), `linesFromDocx` (9), `readResume` (15), `buildResume` (6), the people (3), `openPdf` and `publicSans` (6).

- [ ] **Step 1: Write the tests**

`tests/unit/resume-reader/accuracy.test.ts` (the Word version is the same with the default environment, `linesFromDocx`, and the two `.textutil.docx` files):

```ts
// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { linesFromPdf } from '../../../lib/resume-reader/pdf';
import { readResume } from '../../../lib/resume-reader/read';
import type { ImportDraft, ResumeDetails } from '../../../lib/types';
import { openPdf } from '../helpers/pdf';
import { ada, alan, grace, margaretContact } from '../helpers/people';

const read = async (name: string): Promise<ImportDraft> => {
  const bytes = new Uint8Array(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/resumes', name)));
  return readResume((await linesFromPdf(await openPdf(bytes))).lines);
};

/** Every answer a person would otherwise type, as [where, what the résumé says]. */
const answers = (details: ResumeDetails): [string, string][] => {
  const p = details.profile;
  const fields: [string, string][] = [
    ['firstName', p.firstName], ['lastName', p.lastName], ['email', p.email], ['phone', p.phone], ['city', p.city], ['state', p.state],
    ['linkedin', p.linkedin], ['github', p.github], ['portfolio', p.portfolio],
    ['school', p.school], ['degree', p.degree], ['major', p.major], ['graduationDate', p.graduationDate], ['gpa', p.gpa],
  ];
  details.work.jobs.forEach((job, i) => {
    fields.push([`job ${i} title`, job.title], [`job ${i} company`, job.company], [`job ${i} start`, job.start], [`job ${i} end`, job.current ? 'current' : job.end]);
    job.lines.forEach((text, n) => fields.push([`job ${i} line ${n}`, text]));
  });
  details.work.projects.forEach((project, i) => {
    fields.push([`project ${i} name`, project.name], [`project ${i} link`, project.link]);
    project.lines.forEach((text, n) => fields.push([`project ${i} line ${n}`, text]));
  });
  details.work.skills.forEach((skill, n) => fields.push([`skill ${n}`, skill]));
  return fields.filter(([, value]) => value !== '');
};

/** What the reader got: the same shape, from a draft. */
const drafted = (draft: ImportDraft): Map<string, string> => {
  const profile = { ...draft.profile } as ResumeDetails['profile'];
  const details = { profile, work: { jobs: draft.jobs, projects: draft.projects, skills: draft.skills } };
  return new Map(answers(details));
};

const score = (draft: ImportDraft, truth: ResumeDetails) => {
  const got = drafted(draft);
  const expected = answers(truth);
  const expectedMap = new Map(expected);
  const wrong = [...got].filter(([where, value]) => expectedMap.get(where) !== value).map(([where, value]) => `${where}: read ${JSON.stringify(value)}, résumé says ${JSON.stringify(expectedMap.get(where) ?? '')}`);
  const read = expected.filter(([where, value]) => got.get(where) === value).length;
  return { wrong, read, total: expected.length };
};

const singleColumn: [string, ResumeDetails][] = [
  ['ada-classic.chromium.pdf', ada],
  ['grace-stacked.chromium.pdf', grace],
  ['alan-compact.chromium.pdf', alan],
  ['ada-plain.quartz.pdf', ada],
];

test.each(singleColumn)('%s: nothing is read wrongly', async (name, truth) => {
  expect(score(await read(name), truth).wrong).toEqual([]);
});

test('across the single-column PDFs at least nine answers in ten are read', async () => {
  let read_ = 0;
  let total = 0;
  for (const [name, truth] of singleColumn) {
    const result = score(await read(name), truth);
    read_ += result.read;
    total += result.total;
  }
  expect(read_ / total).toBeGreaterThanOrEqual(0.9);
});

test('the two-column résumé: contact details by pattern, nothing wrong, the rest handed back', async () => {
  const draft = await read('margaret-two-column.chromium.pdf');
  expect(draft.layout).toBe('columns');
  expect(draft.profile).toMatchObject(margaretContact);
  expect([draft.jobs, draft.projects, draft.skills]).toEqual([[], [], []]);
  expect(draft.unused.length).toBeGreaterThan(10);
});
```

`tests/unit/resume-builder/round-trip.test.ts`:

```ts
// @vitest-environment node
import { expect, test } from 'vitest';
import { buildResume } from '../../../lib/resume-builder/build';
import { linesFromPdf } from '../../../lib/resume-reader/pdf';
import { readResume } from '../../../lib/resume-reader/read';
import { openPdf, publicSans } from '../helpers/pdf';
import { ada } from '../helpers/people';

test('a résumé this extension built reads back as the details it was built from', async () => {
  const built = await buildResume(ada, publicSans(), { year: 2026, month: 11 });
  if (!built.ok) throw new Error(built.reason);
  const draft = readResume((await linesFromPdf(await openPdf(built.pdf))).lines);
  const p = ada.profile;
  expect(draft).toEqual({
    profile: {
      firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, city: p.city, state: p.state,
      linkedin: p.linkedin, github: p.github, portfolio: '',
      school: p.school, degree: p.degree, major: p.major, graduationDate: p.graduationDate, gpa: p.gpa,
    },
    leftovers: {},
    jobs: ada.work.jobs.map((job) => ({ ...job, leftover: '' })),
    projects: ada.work.projects,
    skills: ada.work.skills,
    unused: [],
    layout: 'single',
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/unit/resume-reader/accuracy.test.ts tests/unit/resume-reader/accuracy-docx.test.ts tests/unit/resume-builder/round-trip.test.ts`
Expected: some FAIL. Real files exercise what hand-written lines did not.

- [ ] **Step 3: Make them pass by fixing the reader, never by loosening a test**

For each failure, find the rule in Tasks 7 to 15 that the file breaks, add that case to the rule's own test table with its literal expected value (a must-not-match case when the reader read something wrong), then fix the rule. "Nothing is read wrongly" is fixed. If "nine in ten" cannot be reached for a file without guessing, stop and report which answers are missed and why; do not lower the number.

- [ ] **Step 4: Run everything**

Run: `npm run compile && npx vitest run`
Expected: no type errors; every test passes, the other sessions' tests included.

- [ ] **Step 5: Report sizes**

Run: `ls -l node_modules/pdfjs-dist/build/pdf.min.mjs node_modules/pdfjs-dist/build/pdf.worker.min.mjs node_modules/pdf-lib/dist/pdf-lib.min.js node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js`
Report the four sizes and their total. The spec asks for the weight these add to be known before Part B bundles them.

- [ ] **Step 6: Checkpoint**

Commit message, if allowed: `test: reader accuracy on the test résumés, and the build-read round trip`
