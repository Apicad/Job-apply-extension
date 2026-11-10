# Job Apply Assistant — project guide

A Chrome extension (Manifest V3) that fills job application forms from a
profile the user saves in the extension. It fills; the user reviews and
submits.

Stack: WXT 0.21 (Vite-based extension framework), TypeScript (strict),
React 19 for the popup and options page, Vitest + jsdom for unit tests,
Playwright for end-to-end tests in real Chromium.

Several sessions work in this folder at once. This guide covers the fill
engine, background worker, popup, options page and storage. `page-blueprint/`
is a separate tool and `docs/superpowers/` holds another build's design; do
not edit either from this stream. Before editing a shared file, read it as it
is at that moment.

## Product rules — do not break these

1. **Never submit.** Never click buttons or links, never tick checkboxes.
   The only `.click()` in the code base is on a radio button.
2. **When unsure, leave the field alone and report it.** A blank field costs
   the user five seconds; a wrong answer on an application can cost the job.
   This matters most for work-authorization, sponsorship and demographic
   questions. A match must be exact and unique, never "close enough".
3. **Never overwrite** something the user already typed, chose or attached.
4. **Never fill a field the user cannot see.** A text box, textarea or
   dropdown must itself be visible. A radio button or a file input may be
   visually hidden behind a styled control only when that visible control
   passes the same test. Frames hidden by the page that embeds them are never
   written to. Forms plant invisible "honeypot" fields to catch bots.
5. **Data stays in the browser** (`chrome.storage.local`). No network
   requests, no analytics, no remotely loaded code.
6. **No real personal data in the repo.** Fixtures and tests use obviously
   fake people (Ada Lovelace, ada@example.com, 555-0100 phone numbers).
7. **Nothing runs on a page until the user asks**, and every fill is
   previewed first: the popup shows what will be written, and where, before
   anything is written. No content scripts are declared in the manifest.
8. **The page never sees the profile.** Page-side code only describes
   controls and carries out specific instructions. The profile, the résumé and
   every decision stay in the background worker.

## How it fits together

```
popup ──'scan'──▶ background ──executeScript(allFrames) /scan.js──▶ every frame: describe controls
                  │  classify + plan (profile lives here)        ◀── FrameScan (no profile data)
popup ◀─ preview ─┘
popup ──'fill'───▶ background ──per document: instructions + /fill.js──▶ write, read back
popup ◀─ result ──┘                                              ◀── FillOutcome[]
```

- `entrypoints/` — thin entry files. `background.ts`, `scan.ts` and `fill.ts`
  (unlisted scripts injected on demand; they must stay free of
  `defineContentScript`, which announces the extension to the page),
  `popup/`, `options/`.
- `lib/` — the logic. `lib/types.ts` holds every shared type and the function
  contracts each module must satisfy. Read it first.
  - Trusted side (pure, no DOM, no extension APIs):
    `classify.ts` (descriptor → kind), `choices.ts` + `regions.ts` (pick an
    option), `profile.ts` (empty/normalised profile, text for a kind, option
    lists for the UI), `plan.ts` (scans + profile → preview + instructions),
    `report.ts` (attention rule, guards for untrusted input), `ats.ts`
    (job-site detection and the embed host list), `resume.ts`.
  - Page side, `lib/page/` (DOM only; never imports the trusted side except
    types and `ats.ts`): `collect.ts` (find controls, forms, comboboxes),
    `describe.ts` (labels, options, emptiness), `visibility.ts` (markup
    checks) and `layout.ts` (the real-browser `PageEnv`), `refs.ts` (the
    handle table shared by scan and fill), `fill.ts` (the four ways of
    writing), `job.ts`, `scan.ts`, `apply.ts`.
  - `storage.ts` — the only module that touches extension storage. Only the
    background, popup and options page import it.
- `tests/unit/` — Vitest. `tests/e2e/` — Playwright. `tests/fixtures/` — local
  pages copied from the shape of real application forms;
  `tests/fixtures/real-forms.ts` holds the markup of a real Greenhouse and a
  real Lever form, one copy for the unit tests and the fixture pages alike.
  Until the scan and fill entrypoints exist, the e2e tests put the page-side
  code into a fixture page themselves: `openFixture` in
  `tests/e2e/extension.ts` adds the bundle of `tests/e2e/page-side.ts` as
  `window.__pageSide`.
- `research_notes/`, `reports/` — background research. The technical notes and
  their `_verification.md` corrections describe real Greenhouse, Lever, Ashby
  and Workday markup.

## Decisions for version 1

- **Custom dropdowns are reported, not operated.** An `<input>` with
  `role=combobox|listbox`, `aria-autocomplete=list|both`, or `aria-haspopup`
  set and not `false` is a `combobox`: recognised, status `unsupported`, never
  written, no events dispatched on it. Every dropdown on Greenhouse is one.
  Its text box is out of sight by design (4px wide in a React-Select, fully
  invisible and marked read-only where searching is off), so it counts as
  shown when a wrapper that holds no other field is visible.
- **`location` is never written** (typeahead on Greenhouse, Lever and Ashby).
  Nothing is written into a `<textarea>`. Checkboxes are not collected.
- **Never collected:** input types password, hidden, search, submit, button,
  reset, image, checkbox, date, datetime-local, time, week, range, color;
  autocomplete `cc-*`, `one-time-code`, `username`, `current-password`,
  `new-password`; anything inside `[role=search]`; every control of a form
  that contains a password field; anything with `aria-hidden="true"` or
  `inert` on itself or an ancestor.
- **Signature and attestation fields are never filled**: label, group
  heading, name, id or hints matching `signature|certif|attest|acknowledg|declar`.
- **The group can rule a control out.** A fieldset legend or group name about
  someone or something else ("Emergency contact", "References", "Preferred
  name", "If you answered yes above") leaves every control inside alone. Inside
  a group named for the phone only the number itself is recognised: the
  "Country" picker beside it is a dial code. Ordinary section headings
  ("Address", "Additional information") rule nothing out.
- **The résumé is recognised on a file input only**, by its label ("Resume",
  "CV", "Resume/CV") or, when the label says nothing ("Attach"), by its name or
  id. A cover letter is never taken for it.
- **Where a label comes from**, first hit wins: `aria-labelledby`, `aria-label`,
  the control's `<label>` elements, then the text in front of the control
  inside a wrapper that holds no other field (at most four levels up; Lever's
  custom questions have no `<label>`). Text behind a control counts only
  inside a `<label>` with nothing in front (floating labels). A radio group's
  label is its question: the name of a group that holds only its radios, or
  the text in front of the options; never the text of an option. Option
  lists, button captions and anything hidden by markup are never label text.
- **Labels decide.** Identity, contact, address and education kinds match only
  short field-name-like labels (no question mark, at most six words, anchored
  patterns). `autocomplete`, `name`, `id` and data hints may confirm a label or
  stand in when there is no label; if they point to a different kind than the
  label, the field is unknown.
- **One answer, one field.** A kind fills at most one control per document
  (first in document order), except e-mail plus "confirm e-mail".
- **Only the application form.** Controls are grouped by form owner. A group
  is filled only if it looks like an application: it has a résumé input, or a
  name plus e-mail plus one more recognised kind. On a known job site every
  such group is filled; elsewhere only the best one in the tab. When any
  frame of a known job site has something to fill, other frames are left
  alone.
- **Choices need a unique, exact match** on normalised option text against a
  per-answer list of accepted phrasings. No substring, prefix or fuzzy
  matching. Yes/no answers only when the options are exactly one "yes" and one
  "no". Options mentioning consent, agree, acknowledge or certify are never
  chosen. Options are picked by index.
- **Empty means unanswered**: text — only whitespace; select — nothing
  selected, or the selected option has value `''`, is disabled, or is the
  first option reading like a placeholder ("Select…", "Choose…", dashes);
  radio group — none checked; file input — no file and no file name or
  Replace/Remove control shown beside it; custom dropdown — its text box is
  empty and no chosen value is printed beside it (a React-Select never puts
  the choice into its text box).
- **Writing**: the prototype `value` setter, then `input` (bubbles, composed)
  and `change` (bubbles). Select by `selectedIndex`. Radio by `.click()`, never
  on a checked one. No `focus()`, `blur()`, `select()` or `scrollIntoView()`.
  After writing, a control that is still empty is `failed`.
- **The keyboard shortcut opens the popup**; it never fills on its own.
- **Embedded forms**: host permission only for hosts verified to serve
  application forms inside other sites' pages (`job-boards.greenhouse.io`,
  `job-boards.eu.greenhouse.io`, `jobs.ashbyhq.com`). Top-level pages on any
  site are covered by the toolbar click.

Not in version 1: operating custom dropdowns and typeaheads, date pickers,
multi-step forms (Workday), answering free-text questions, LinkedIn or Indeed,
the application log.

## Platform facts checked by experiment

Verified in Chromium 158 with Playwright 1.65 and WXT 0.21.5 (November 2026).
Re-check them if a major version changes.

- A script's `main()` return value — also from an `async main` — comes back as
  that frame's `result` from `chrome.scripting.executeScript({ files })`.
  Checked for content-script entrypoints; unlisted scripts use the same
  wrapper minus the context object (re-check when first wired up).
- With `allFrames: true`, frames the extension has no permission for are
  skipped silently. The call only rejects ("Cannot access contents of the
  page…") when the top frame itself is off limits. A frame whose script throws
  yields an empty result, not an error.
- A toolbar click grants access to the tab's top-level origin only. A
  cross-origin frame is reachable only through a host permission.
- From a content script, the value setter followed by bubbling `input` and
  `change` events updates a real React 19 controlled `<input>` and `<select>`;
  `radio.click()` updates a controlled radio group. These events are untrusted
  (`isTrusted` is false). In jsdom, where page and test share one world, only
  the prototype setter works — use it everywhere.
- A `File` assigned to `input[type=file]` through `DataTransfer` reaches the
  page, with a `change` event. Job sites upload it immediately.
- `Element.checkVisibility()` and `chrome.dom.openOrClosedShadowRoot()` exist
  in content scripts. Only open shadow roots are walked.
- The search box of a React-Select 5 (stock styles, as on Greenhouse) measures
  4 by 18 CSS pixels while empty; its `select__input-container` wrapper is
  as wide as the dropdown. With `isSearchable: false` the input is a
  `DummyInput`: `opacity: 0`, `transform: scale(0.01)`, `aria-readonly="true"`.
  A chosen value is printed into `select__single-value` (or
  `select__multi-value`) beside the input, whose own value stays empty.
  Measured with react-select 5.10.2 in Chromium 153.
- Playwright only loads extensions in its bundled Chromium with a persistent
  context (`channel: 'chromium'`); headless works.

## Commands

Needs Node 22.12 or newer (`.nvmrc` pins 24).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev mode: builds, opens a browser with the extension loaded, reloads on change. Never put real data in a dev build |
| `npm run build` | Production build into `.output/chrome-mv3` (load this folder in `chrome://extensions`) |
| `npm run compile` | Type-check |
| `npm test` | Unit tests |
| `npm run test:e2e` | Build the `e2e` variant and run the Playwright tests |
| `npm run check` | All of the above checks |

## Conventions

- Explicit imports everywhere (`import { browser } from 'wxt/browser'`); do not
  rely on WXT auto-imports. Use the `@/` alias for project-root imports in
  entrypoints; relative imports inside `lib/` and tests.
- The tsconfig is strict with `noUncheckedIndexedAccess` and
  `verbatimModuleSyntax`: index access yields `T | undefined`, and types are
  imported with `import type`.
- Each module exports constants typed with the contracts in `lib/types.ts`.
- Work test-first: write the failing test, watch it fail for the right
  reason, then write the code. Table-driven tests with literal expected
  values. Tests exercise real code and a real (jsdom) DOM — no mocks of our
  own modules. jsdom has no layout, so page-side code takes a `PageEnv`; unit
  tests pass a stub, and the real one is covered by Playwright.
- Precision over coverage in classification: every rule needs tests for what
  it must NOT match as well as what it must, using real labels.
- Everything a page returns is untrusted: validate shape, cap lengths, render
  as plain text. Never use `innerHTML`.
- Do not commit unless asked.
