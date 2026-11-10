# Landing page, experience and resume: design

Status: ready for the owner's approval. Written 2026-11-09. Read once by a
fresh builder the same day; its questions and the owner's answers are folded
in below (section 13).

This is the first of three builds for Job Apply Assistant. The other two
(filling applications, and the application log) are not designed here.

Pictures of everything described below:

- Screens, clickable with Play: https://claude.ai/artifact/Wy7nCEK516wZ8oBvcW8P1q
- Journey, stage by stage: https://claude.ai/artifact/WzwXf8kQVbgXM4zQJJ6ZfK
- Structure, as a tree: https://claude.ai/artifact/3FmhegF1P613H1fenrHWk5

The pictures are private pages. Everything a builder needs from them is written
out in this document, including the wording (appendix A). The pictures do not
set colours or type: the project's own theme does (see "Look" in section 9).
They were drawn before Projects was added. Where a picture and this document
differ, this document wins.

## 1. What this is, and why

People applying for jobs retype the same facts into every application. Job
Apply Assistant fills those forms from a saved profile, and the person reviews
and submits. That only works once the profile exists, and typing a profile in
by hand is the same chore again.

This build gets a person's experience into the extension with as little typing
as possible, and gives something back straight away:

1. A landing page that opens when the extension is added and says what it does.
2. Two ways to add experience: upload the resume you already have, or type it in.
3. A clean one-page resume built from that experience, to download and to attach
   to applications.

The landing page headline is the owner's own words: "Applying should not be a
full-time job."

It has worked when someone who has just added the extension has a checked
profile and a resume PDF a few minutes later, without creating an account and
without anything leaving their browser.

## 2. Who it is for

Students and people early in their careers who are applying to many jobs and
internships. Most already have a resume as a PDF or a Word file. Some have none.

## 3. What the person does

1. **Landing page.** Adding the extension opens this page once. It shows the
   headline, an example application form with filled answers highlighted, how it
   works in four steps, and four things the assistant never does. One button:
   "Add your experience".
2. **Add your experience.** Two choices side by side. "Upload your resume"
   takes a PDF or Word file by drag and drop or a file picker. "Type it in"
   opens the empty profile form.
3. **Check what was read** (upload path). The profile form, already filled in
   from the file. Every answer that came from the file is highlighted. Every
   field the reader could not fill is left blank and flagged. The person fixes,
   fills, and presses "Save and build my resume". Nothing is saved before that.
4. **Type it in** (manual path). The same form, starting blank. Same button.
5. **Your resume.** A preview of the built resume, "Download PDF", a choice of
   which file gets attached to applications, and "Edit my details".

Both paths end in the same saved profile.

## 4. Goals

- The landing page opens once, right after the extension is added, and can be
  opened again later.
- A person can add their experience by uploading a PDF or a .docx file, or by
  typing.
- An uploaded file is read on the person's computer. What was read is shown
  for checking before anything is saved.
- The profile holds what a resume needs: contact details, links, one school,
  any number of jobs with dates and description lines, any number of projects,
  and a list of skills. It also holds the optional application answers the
  project already defines.
- A one-page resume PDF is built from the profile, previewed, and downloadable.
- The person chooses which file the assistant attaches to applications: the
  built resume or a file they uploaded.
- Everything is stored in the browser. No network requests are made.

## 5. Not in this build

- Accounts, sign-in, sync between browsers, any server. Decided by the owner.
- Reading a resume with an AI service, or rewriting a resume for a specific job.
- More than one resume layout. Cover letters.
- More than one school. Sections beyond jobs, projects, education and skills,
  such as awards, activities or coursework.
- Filling application forms, the popup, the fill report, the application log.
- Reading scanned resumes (images with no text in them).
- Resumes in languages other than English. They can still be uploaded, but few
  fields will be read.
- Text in writing systems other than Latin on the built resume (see 8.6).
- A public website for people who have not added the extension.
- Export, backup, or a "delete all my data" control.

## 6. What would make this a failure, even if it works

- A wrong value from an uploaded resume ends up saved without the person having
  been shown it. Wrong details then go into real applications.
- Any network request: a font, an analytics call, a parsing service.
- Uploading a second resume quietly removes or changes details the person typed.
- The reader guesses an answer to a work-authorization, sponsorship or
  demographic question from the text of a resume. It must never fill these.
- Text from the resume silently disappears: the person only finds out later
  that a job or a line was dropped.
- The reader only understands resumes this extension built. The upload path
  would then be close to useless.
- The built resume is a picture of text. Employers' systems cannot read it.
- The built resume shows a wrong or missing letter in the person's name.
- The landing page opens again and again.
- Real personal data in the repository.

## 7. Who decided what

| Decision | Whose |
| --- | --- |
| Everything stays in the browser: no accounts, no server | Owner |
| Landing page headline: "Applying should not be a full-time job." | Owner |
| The flow in section 3, as drawn in the pictures | Owner (approved from the pictures) |
| This build comes first; filling and the log follow | Owner |
| The pages live inside the extension and the landing page opens once after it is added | Follows from "browser only": only the extension can write to its own storage |
| An uploaded resume is read on the computer by rules, not by an AI service | Follows from "browser only" |
| PDF and .docx are the accepted file types | Designer's call |
| One resume layout, US Letter, one page | Designer's call |
| This build owns the extension's own pages (landing page, profile form, resume) and the stored profile | Owner |
| One school, many jobs, a skills list | Designer's call |
| Projects are part of the profile and the built resume | Designer's call. Recommended to the owner, who has not answered. Strike it to leave Projects out |
| The reader targets single-column resumes from Word, Google Docs and LaTeX | Designer's call. Offered to the owner as the default; no other list was given |
| A field the reader is not sure of stays blank, with the source text shown beside it | Designer's call, applying project rule 2 |
| On a second upload, jobs, projects and skills are replaced as whole lists; other answers change only where the new file supplies one | Designer's call, applying project rule 3 |
| Default file to attach: the uploaded file if there is one, otherwise the built resume | Designer's call. The picture shows the built resume selected; this document wins |
| The built resume is rebuilt every time the saved details change | Designer's call |
| The built resume is set in Public Sans and covers Latin-script text | Designer's call. The picture shows a serif; this document wins |
| "Current company" and "current title" come only from a job the person still holds | Designer's call, applying project rule 2 |
| What the reader must manage on other people's resumes (section 11) | Designer's call |

## 8. Behaviour in detail

### 8.1 Landing page

- Opens in a new tab once, when the extension is first added. Not on update,
  not on browser start, not when the extension is re-enabled.
- Content and wording: appendix A.
- The example form is an illustration. It uses the made-up person the project
  already uses (Ada Lovelace, ada@example.com, 555-0100).
- If details are already saved, the button reads "Go to my details" and opens
  the profile form instead of the choice screen.
- Opening this page is the only thing the extension does on its own. It is the
  extension's own page, not a website, so it does not break the rule that
  nothing runs on a page until the person asks.

### 8.2 Adding experience

- Upload accepts one file: `.pdf` or `.docx`. Anything else is refused with a
  sentence that names the accepted types.
- Files over 4 MB are refused with a sentence that says so. The limit is the
  project's own `MAX_RESUME_BYTES` in `lib/resume.ts`.
- A PDF that needs a password, or a file that cannot be opened, is refused with
  a sentence that says what happened and offers "Type it in" instead.
- A PDF with no text in it (a scan) is refused the same way.
- While the file is being read the screen says so, and the page stays usable.
  A normal one or two page resume should be read in about two seconds. Files
  longer than ten pages are read only up to page ten, and the screen says so.
- If details are already saved, uploading asks first and says exactly what will
  happen:
  - Jobs, projects and skills are replaced as whole lists by what is read from
    the new file. If the reader finds no jobs, the saved jobs stay. The same
    goes for projects and for skills.
  - A contact or education answer changes only when the reader fills that
    field from the new file. A field the reader does not fill keeps its saved
    answer.
  - Fields a resume never supplies are not touched: street address, postal
    code, country, and every application answer.
  - As always, nothing is saved until the person presses save on the check
    screen. Leaving without saving keeps everything as it was.

### 8.3 Reading an uploaded resume

The reader turns the file into text with its layout, finds the sections, and
fills a draft of the profile. It runs entirely in the page.

Fields it tries to fill:

| Section | Fields |
| --- | --- |
| Contact | first name, last name, email, phone, city, state, LinkedIn, GitHub, personal site |
| Education | school, degree, major, graduation month and year, GPA |
| Each job | title, company, start month, end month or "still there", description lines |
| Each project | name, link, description lines |
| Skills | each skill as its own item |

Rules:

- **Only fill on a specific, testable reason.** An email matches an email
  pattern. A phone number matches a phone pattern and sits in the header, not
  in a bullet. A date range looks like "Jun 2026 – Aug 2026" or "Sep 2025 –
  Present". A section starts at a heading from a fixed list ("Education",
  "Experience", "Work Experience", "Employment", "Projects", "Skills", and
  close variants).
  When there is no such reason, the field stays blank.
- **Blank beats wrong.** A job's title and company are told apart by evidence:
  the word "at", a role word ("Intern", "Engineer", "Tutor"), an organisation
  word ("Ltd.", "Inc.", "University"). If nothing settles which is which, both
  fields stay blank and the line is shown beside them (see 8.4).
- **Never infer the application answers.** Work authorization, sponsorship,
  gender, race, veteran status and disability are never filled from a resume,
  whatever the text says.
- **Nothing is dropped silently.** Any text the reader did not use is kept and
  shown on the check screen under "Not used from your resume", so the person
  can copy from it.
- Two-column and heavily designed resumes will read less well. That is
  accepted. The result must still be honest: more blank, flagged fields, never
  scrambled values.
- When the file is laid out in columns, the reader fills only what it can find
  by pattern anywhere on the page (email, phone, LinkedIn, GitHub) and leaves
  everything else for the person. The check screen says that is why.

How well it has to do is set out in section 11.

### 8.4 The check screen

- It is the profile form, filled with the draft.
- A field the reader filled is highlighted, carries the words "From your
  resume", and is counted in "N answers read".
- A field the reader tried and could not fill, and that has no saved answer, is
  blank, carries the words "Left for you" with the reason, and is counted in
  "N left for you". If the reader had text it could not place for that field,
  the text is shown there too.
- On a second upload, a field that kept its saved answer is shown plainly: no
  highlight, no flag.
- Colour is never the only signal. The words are part of each mark.
- Editing a highlighted field removes its highlight: it is now the person's
  answer. Typing in a flagged field removes the flag. The counts follow.
- "Save and build my resume" saves what is on the screen, keeps the uploaded
  file, builds the resume and opens "Your resume".
- "Replace file" goes back to the choice screen. "Type it in instead" opens the
  blank form. Neither saves anything.
- Leaving the screen without saving stores nothing, not even the file.
- A short note says a resume cannot answer the work-authorization and
  sponsorship questions, and links to that part of the form.

### 8.5 The profile form

There is one profile form in the extension. The check screen and "Type it in"
are the same form in two starting states.

- Sections: Contact, Work experience, Projects, Education, Skills, Application
  questions.
- The form lets the person edit every field in the project's `Profile` type,
  including the address fields the pictures leave out.
- Work experience holds any number of jobs. Each has a title, a company, a
  start month, an end month or an "I still work here" tick, and a description
  with one line per bullet. "Add another job" adds one; each job can be removed.
- Jobs are ordered by start month, most recent first. Jobs with no start month
  come last, in the order they were added.
- Projects holds any number of projects. Each has a name, an optional link, and
  a description with one line per bullet. They stay in the order the person
  puts them in, and each can be moved up, moved down or removed.
- Education holds one school.
- Skills is a list. Type a skill and press Enter to add it; each can be removed.
- Each application question has three states: Yes, No, and No answer. No answer
  is the default, and the person can go back to it. A question left on No
  answer is never answered for them on any application.
- No field is required to save.
- `Profile.currentCompany` and `Profile.currentTitle` keep their meaning: the
  job the person holds now. They are set from the job ticked "I still work
  here". With several such jobs, the one that started latest wins; if that
  ties, the one higher in the list. With no such job they are empty, so a
  "current company" question on an application is left for the person instead
  of being answered with a former employer. The form shows these two as
  separate inputs only while there are no jobs at all.

### 8.6 The resume

- Built from the saved details. Layout, top to bottom: name; one contact line
  (city and state, email, phone, links); Education; Experience, most recent
  first, each with title and company on the left, dates on the right, and its
  lines as bullets; Projects, each with its name, its link and its lines as
  bullets; Skills. Empty sections are left out.
- US Letter, black on white, real selectable text. Set in Public Sans, embedded
  in the file. Public Sans covers Latin letters, accented ones and Vietnamese
  included.
- If the details contain a character the typeface cannot show (Cyrillic, Greek,
  Chinese, Japanese, Korean, Arabic, Hebrew and Indic scripts are not covered),
  the resume is not built. The screen names the characters and the fields they
  are in. A resume with a missing letter is never produced.
- Aims for one page. If the content does not fit, the type shrinks, but not
  below 9.5 pt. If it still does not fit, it runs onto a second page and the
  screen says so. Content is never cut.
- A resume needs at least a name and one of education, a job or a project. With
  less than that, the screen says what to add instead of showing an empty page.
- The preview shows the real file, not a look-alike.
- "Download PDF" saves it as `First-Last-Resume.pdf`.
- The built resume is rebuilt whenever the saved details change, so the stored
  copy is never out of date.
- "When an application asks for a resume, attach": "This resume" or "The file I
  uploaded". The choice is only shown when both exist. Default: the uploaded
  file if there is one, otherwise the built resume.
- "Attach a different file" stores a file as the uploaded file without reading
  it and without changing any details. It takes any type the project already
  accepts as a resume (`ACCEPTED_RESUME_TYPES` in `lib/resume.ts`). It is the
  only other way a file gets in; there is no separate resume picker anywhere
  else.
- "Edit my details" opens the profile form.

### 8.7 What is kept, and where

Everything is kept in the extension's local browser storage, through the
project's storage module. Nothing is kept anywhere else.

- The profile (the project's existing `Profile`).
- Jobs, projects and skills (new).
- The uploaded file, if any (the project's existing `StoredResume` shape).
- The built resume (same shape).
- Which of the two to attach.

Each file is stored once. The storage module offers one function that returns
the file to attach, already resolved from the choice. The fill engine uses only
that function, and the project's `AutofillInput.resume` is filled from it.

The browser gives the extension 10 MB. A stored file takes about a third more
than its size on disk, so a 4 MB upload takes about 5.4 MB and the built resume
well under 1 MB. Before saving a file, check that it fits, and say so plainly
if it does not.

A sketch of the new data, for the builder to adjust:

```ts
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

/** One project. '' always means "no value". */
export interface Project {
  id: string;
  name: string;
  /** A web address, or ''. */
  link: string;
  /** One entry per bullet, in order. */
  lines: string[];
}

/** What a resume needs beyond `Profile`. */
export interface WorkHistory {
  jobs: Job[];
  /** In the order the person arranged them. */
  projects: Project[];
  skills: string[];
}

/** Which file the fill engine attaches. */
export type ResumeChoice = 'uploaded' | 'built';
```

Existing fields of `Profile` must not change meaning. The fill engine is being
built against them.

### 8.8 Getting around

- During first setup the top of each page shows the four steps: "Extension
  added", "Your experience", "Your resume", "Fill an application", with the
  current one marked.
- Once details are saved, the top of each page instead links to "Profile" (the
  profile form) and "Resume". The application log joins them when it is built.
  The product name opens the landing page.
- Someone with saved details uploads again from the profile form: "Upload a
  resume instead", next to the save button, opens the choice screen.

## 9. Constraints

- **Project rules.** The seven product rules in `CLAUDE.md` apply. The ones
  that bite here: data stays in the browser with no network requests and no
  remotely loaded code (rule 5); no real personal data in the repository
  (rule 6); when unsure, leave it blank and report it (rule 2); never overwrite
  what the person entered (rule 3).
- **Stack and conventions.** As in `CLAUDE.md`: WXT, strict TypeScript, React
  for pages, logic in `lib/` with no extension APIs outside `lib/storage.ts`,
  explicit imports, test first, table-driven tests with literal expected
  values, no mocks of the project's own modules. Each module exports constants
  typed with the contracts in `lib/types.ts`, and types are imported with
  `import type`.
- **Look.** Use `assets/theme.css`: its paper, ink, ballpoint, highlighter and
  flag colours, and the Public Sans typeface that ships inside the extension.
  The pictures load fonts from the network and use a second typeface for
  headings; the build must do neither. Where a picture and the theme disagree
  on colour or type, the theme wins. Layout and wording come from this
  document.
- **Extension platform.** No code is fetched or evaluated at run time. Any
  library used to read or write PDFs is bundled, including its worker file.
  No new permission is needed for anything in this document; if the builder
  finds one is, stop and ask.
- **Size.** Reading and writing PDFs will add libraries and a font file for the
  resume. Keep an eye on the size of the built extension and report it.

## 10. How this fits with the rest of the project

A separate stream of work, in another session, is building what `CLAUDE.md`
describes: the fill engine, the background worker, the popup, the options page
and storage. By the evening of 2026-11-09 it had written the shared types and
function contracts in `lib/types.ts`, the classifier, the page-side modules and
`lib/resume.ts` (the stored resume file, its size limit and accepted types).
There was still no `lib/storage.ts`, no `lib/profile.ts` and no options page.
Its guide still lists the options page and storage as its own: it had not yet
been told of the decision below.

- **One profile form, one owner.** Section 8.5 changes how the profile form
  behaves (nothing required, three-state answers, the current job worked out
  from the list, the save button's wording). It cannot be bolted onto a form
  built to a different brief, so one stream has to own it. The owner decided:
  this build owns the extension's own pages (landing page, profile form,
  resume) and the stored profile. The other stream owns everything that runs
  on job sites, the background worker, the popup and the application log, and
  does not build an options page of its own.
- **Where the two streams meet.** `Profile` in `lib/types.ts`, and the one
  storage function that returns the file to attach (8.7). Nothing else.
- **The other stream has to know.** It planned an options page. Before Part B
  starts, confirm it has dropped that from its plan, and agree which stream
  creates `lib/storage.ts`.
- **Shared files this build has to touch,** always by adding and never by
  changing what is there: `package.json` and `package-lock.json` (new
  libraries), `lib/types.ts` (new types), `lib/storage.ts` (new stored items),
  `entrypoints/background.ts` (open the landing page on install).
- **Files this build owns outright:** the landing page, the choice screen, the
  resume screen, the resume reader and the resume builder, their tests and
  their test files, and the profile form (the options page).
- **Two parts.** Part A is the reader and the builder: library code in its own
  folders. Its only shared files are `package.json` and `package-lock.json`.
  Part B is the pages and storage.
- **Several sessions write in this folder at once,** and nothing is committed
  yet. Before creating or editing a file in a shared place, read it as it is at
  that moment and add to it. Never write `package.json` from memory.

## 11. How it is tested, and how good the reader has to be

**The reader's bar.** Other people's resumes are the point of the upload path.

- Sources it must handle: single-column resumes written in Microsoft Word (the
  .docx itself and its PDF), Google Docs (PDF) and LaTeX (PDF).
- On the test resumes from those sources: no field is ever filled wrongly, and
  at least nine in ten of the fields a person would otherwise type are read.
- The first number is fixed. If the second cannot be reached for a source, the
  builder reports it. Loosening "no wrong fields" to get there is not allowed.
- On two-column resumes there is no target for fields read. "No wrong fields"
  still holds.

**Test resumes.** Made-up people only, written by the builder. PDFs come from
more than one PDF writer, because the text comes out differently from each: at
least Chromium's (the family Google Docs exports with) and macOS's own, plus
this extension's builder. .docx files are included as files. Exports from
Word, Google Docs and LaTeX are added when the owner supplies them.

**Tests.**

- **Reader, unit tests.** Table-driven, with literal expected results. Each
  rule has cases it must match and cases it must not: a number in a bullet that
  is not a phone number, a year in a sentence that is not a date range, a
  heading-like word inside a paragraph, a job line where title and company
  cannot be told apart.
- **Builder, unit tests.** Build a resume from a made-up profile, read the text
  back out of the PDF, and compare with literal expected lines. Cover a name
  with accented letters, a name with a character the typeface lacks, a profile
  that overflows one page, and a profile with empty sections.
- **Round trip.** Build a resume, feed it to the reader, and expect the same
  details back.
- **Second upload.** Saved details plus a new file: lists replaced, unfilled
  fields kept, untouched fields untouched, nothing saved before the button.
- **End to end, in real Chromium with the extension loaded.** Adding the
  extension opens the landing page once. Upload a made-up resume; the check
  screen shows the highlighted and flagged fields; save; the resume screen
  shows the preview; download gives a PDF. The type-it-in path the same. Reopen
  the browser and the details are still there. Throughout, assert that no
  request left the extension's own origin.

**By hand.** Before this is called done, the owner tries their own resume. It
is never added to the repository.

## 12. Left to the builder

- Which libraries read and write PDFs and read .docx, within the constraints.
- Folder and file layout, and how the pages are split into components.
- Whether the landing, choice and resume screens are separate pages or views of
  one page.
- The reader's exact patterns and word lists, as long as each has tests on both
  sides.
- How the preview is drawn, as long as it shows the real file.
- Exact wording of error messages, in the voice of appendix A: plain, says what
  happened, says what to do.
- The names of the storage functions.

## 13. The three questions put to the owner

1. **Who owns the profile form?** Answered: this build. See section 10.
2. **Is Projects in this build?** Not answered. The designer's recommendation,
   yes, is written in throughout. To leave Projects out, strike it from
   sections 4, 5, 7, 8.2, 8.3, 8.5, 8.6, 8.7 and appendix A.
3. **Which tools do the resumes come from?** Not answered. The offered default
   stands: single-column resumes from Word, Google Docs and LaTeX.

## Appendix A. Wording

Sentence case throughout. The made-up person is Ada Lovelace.

### Landing page

- Headline: Applying should not be a full-time job.
- Paragraph: Upload your resume or type in your experience once. Job Apply
  Assistant builds your resume from it, fills in application forms for you, and
  keeps track of where you applied. You check every answer and press Submit
  yourself.
- Button: Add your experience
- Under the button: No account needed. Your details stay in this browser.
- Example form, titled "Example job application", "Software Engineer Intern",
  "Analytical Engines Ltd.":
  - First name: Ada. Last name: Lovelace. Email: ada@example.com. Phone:
    555-0100. School: University of London. All five highlighted.
  - "How did you hear about this job?": blank and flagged, with "Left for you.
    This is not in your profile, so the assistant did not guess."
  - A "Submit application" button, with "You press this. The assistant never
    does."
  - Key: "Filled from your profile" and "Left for you".
- How it works:
  1. Add your experience. Upload the resume you already have, or type your
     experience in. You check what was read before anything is saved.
  2. Get your resume. Your details are laid out as a clean one-page resume you
     can download and attach.
  3. Fill an application. On a job application page, press Fill. The answers it
     put in are highlighted so you can check them, then you submit.
  4. Keep track. Add each application to your log and update its status as you
     hear back.
- Four things it will never do. "A blank field costs you five seconds. A wrong
  answer can cost you the job. So the assistant holds back whenever it is not
  sure."
  - Press Submit for you. It fills in the form. You read it over and send it
    yourself.
  - Guess an answer. When it is not sure, it leaves the field blank and tells
    you. That matters most for work authorization, sponsorship and demographic
    questions.
  - Change what you typed. Anything you already entered or chose stays exactly
    as you left it.
  - Run before you ask. Nothing happens on a page until you press Fill.
- Closing band: "Start with the resume you already have." "No resume yet? Type
  your experience in and get one." Then the button again.
- Foot of the page: "Job Apply Assistant" and "It fills. You review and submit."

Steps 3 and 4 and the four promises describe the whole product. The other two
builds keep them.

### Add your experience

- Heading: Add your experience. "This is what fills in your applications and
  builds your resume. Start whichever way is faster for you."
- Upload panel: "Upload your resume". "Drag your resume here". "PDF or Word
  document". Button: "Choose a file". "We read it and show you what we found.
  Nothing is saved until you have checked it."
- Type panel: "Type it in". "No resume yet, or want a fresh start? Fill in your
  details one section at a time." List: Contact details; Work experience;
  Projects; Education; Skills; A few application questions, all optional.
  Button: "Type it in".
- Below both: "You can switch at any time. Both ways end in the same profile."

### Check what was read

- Heading: Check what we read from your resume. "Highlighted answers came from
  your resume. Fix anything that is wrong. Where we could not read something,
  the field is left blank for you."
- File row: the file name and page count; "20 answers read"; "2 left for you";
  "Replace file".
- On a highlighted field: "From your resume".
- On a flagged field: "Left for you", then the reason, for example "Not found
  in your resume." or "No end date found. Leave it blank if you still work
  here."
- List at the foot: "Not used from your resume".
- Note: "A resume cannot answer two questions most applications ask: work
  authorization and visa sponsorship. Answer them in your profile, or leave
  them blank and the assistant will never answer for you." Link: "Answer them
  now".
- Buttons: "Save and build my resume". "Type it in instead".

### Type it in

- Heading: Type in your experience. "Fill in what you have and skip what you do
  not. An answer you leave blank here stays blank on your applications."
- Contact: First name, Last name, Email, Phone, City, LinkedIn, and the rest of
  the `Profile` contact and address fields.
- Work experience: "Job 1", "Job 2" and so on. Job title, Company, Start, End,
  "I still work here", What you did. Button: "Add another job".
- Projects: "Project 1", "Project 2" and so on. Name, Link, What you built.
  Button: "Add another project".
- Education: School, Degree, Major, Graduation, GPA.
- Skills: "Add a skill", with the hint "Type a skill and press Enter".
- Application questions: "Optional. If you leave one unanswered, the assistant
  leaves that question for you on every application." "Are you legally
  authorized to work in the country you are applying in?" "Will you now or in
  the future require visa sponsorship?" Each: Yes, No, No answer. "Voluntary
  questions about gender, race, veteran status and disability work the same
  way. They are always optional."
- Buttons: "Save and build my resume". "Upload a resume instead".

### Your resume

- Heading: Your resume is ready. "It is built from your profile. Change your
  profile and this page updates."
- "Download PDF".
- "When an application asks for a resume, attach": "This resume"; "The file I
  uploaded", with the file name. "Attach a different file".
- "Something to fix? Correct it in your profile and the resume follows." Link:
  "Edit my details".
- "Next, fill an application". "Open any job application, then press the Job
  Apply Assistant button in your browser's toolbar."
