# Building-agent prompt: smaller HackerSquad release

> November 11 profile-home follow-up: the owner requested one home page for information entered once and reused across applications, instead of repeated chat questions. The extension home and sidebar share the existing saved profile, résumé and experience facts. Missing education or other answers are editable in that home and are never guessed. This follow-up also adds bounded Greenhouse dropdown/education handling and phone/upload verification fixes. Final submission remains manual. The README describes implemented scope; tests and live observations remain separate evidence.

> November 10 sidebar follow-up: the user authorized one-click saved-detail autofill, a persistent sidebar, and an existing-account local AI connection. This supersedes the manual copy/paste and separate approve/save/preview UI sequence below for the new sidebar. Generated answers still require an explicit review-and-use action; final submission remains manual. The original plan is retained here as foundation history. See the root README for current scope and setup.

Copy this prompt to the implementation agent. This is an instruction to build; this document does not establish that any feature or test is complete.

---

You are implementing Job Apply Assistant in the repository root. Build the small hackathon release described below, test it in separate branches/worktrees, and prepare a reproducible candidate. Preserve current and concurrent work. Continue through implementation and verification; do not return only another plan.

## Read and establish the baseline

Read applicable `AGENTS.md`, current `CLAUDE.md`, `package.json`, `.nvmrc`, current types/storage, and `docs/plans/2026-11-09-jobright-inspired-autofill.md`. Its **Authoritative hackathon scope**, **Source evidence**, and **Approval and saved-answer contract** govern this release. The broader milestone roadmap is not a requirement to implement every feature now. Read existing résumé/AI specs to reuse interfaces, not to expand scope.

Inspect git status, worktrees and actual source before claiming what exists. HEAD may omit active uncommitted implementation. Coordinate file ownership and obtain owned checkpoint commits or an agreed file-by-file snapshot before branching. Do not reset/stash/discard another worker's files, use `git add .`, change the shared checkout's branch, or assume a new worktree inherits dirty files. Preserve authorship and record prior work accurately. Run baseline checks in an isolated checkout using the pinned Node; report pre-existing failures.

## The product we must demonstrate

“Draft application answers from my saved experience, show where the statements came from, remember the answers I approve, and let me review what gets filled.”

One complete flow is the goal:

1. Load a fictional applicant with a few saved experience facts and open a labeled sample application.
2. Select a non-sensitive question such as “Describe a relevant project.” Preview the exact selected facts, question and reviewed job context sent to AI.
3. Obtain a real AI draft through one functioning route. Use a ready existing helper or validated copy/paste; do not build multiple integrations. Resolve a practical no-purchase judge route early.
4. Open each sentence's source snippets, show gaps, edit if needed and approve the exact wording.
5. Explicitly save the approved answer. Reopen the extension and inspect it in a small answer library.
6. Preview then fill supported native controls and the approved textarea. Verify exact text readback and report unsupported controls honestly.
7. Demonstrate that a changed source invalidates review, and that reuse on another application requires a new application-bound approval.

The user submits manually. AI being unavailable must not break ordinary profile autofill.

Do not make new résumé tailoring, cover letters, a requirements dashboard, a full materials screen, additional ATS adapters, custom dropdowns, Workday navigation, semantic search or AI field recognition release prerequisites. Preserve existing implementations and regression tests. Use an already uploaded résumé if needed; whenever attaching a file, retain application/selected-file revision binding and existing-file protection. Do not wait for an entire résumé-builder stream to finish.

## First optional addition if time remains

The owner wants LinkedIn as a starting source of experience. Follow the main plan's “First optional addition: LinkedIn profile import” after the core passes. Prefer pasted profile text and reuse an already working PDF import path if available. Show extracted facts for confirmation, preserve original source snippets/revisions and handle duplicates without silent overwrite. Label it import, not account sync. Full LinkedIn history is not provided by standard sign-in. Do not let this addition delay required testing or create a new prerequisite; direct sync remains later work.


## Non-negotiable contracts

**Source review:** each saved fact has an ID, revision, original text and readable location. Separate job requirements from applicant evidence. AI replies contain bounded sentence segments with supporting fact references and missing-information notes, plus schema/request/application/question/source-revision identity. Derive rendered text from validated segments. Clicking a reference reveals the exact original snippet. Reject invented references and stale identities; show unsupported statements as gaps requiring review. Valid IDs alone do not prove factual support. Never turn a job requirement into a personal accomplishment or fabricate credentials, numbers or dates.

**Edits and approval:** generation produces a draft; approval binds exact text and context revision. Editing or regeneration invalidates approval and affected source mappings. Preserve the original trace and visibly label user edits. A user cannot silently inherit “AI verified” citations for new prose. Source/context changes invalidate dependent approvals/plans. A model cannot mutate saved profile facts.

**Saved answers:** saving is explicit and separate from approval, fill and submission. Store schema/answer revisions, exact text, question/context fingerprint, control kind, scope/application identity, source IDs/revisions, origin, approval revision and timestamps. Default to the current application. Optional reusable factual experience requires an explicit scope choice and fresh approval for every new application. Job-specific motivation remains scoped. Similar labels only suggest candidates. Provide save/list/inspect/edit/delete, reopen persistence, honest storage failure and stale-source handling; no silent eviction. Draft, deleted and stale answers cannot fill.

**Execution:** use the existing trusted-background scan → plan → preview → fill → verify architecture. Bind plan/scan/document/tab/application/question/source/answer/profile/file revisions as applicable. Recheck emptiness, visibility, labels/options and limits at execution. No overwrite, hidden-field write, arbitrary page action, implicit Enter submission or consent/attestation automation. Sensitive values stay in the explicit profile/exact-choice flow, outside AI. Page strings and AI outputs are data, never instructions or executable selectors/actions. Render replies as text.

**AI boundary:** explicit payload preview/send, selected facts only, no contacts/sensitive values/credentials/file bytes. User-entered prose can contain personal information, so show actual payload. Validate pasted and helper replies identically. Bound requests, cancel/time out safely, reject duplicate/late replies, and never silently retry billable operations. Keep secrets out of the extension/page/public repository. Automated tests use a fake external boundary; separate real smoke evidence must use synthetic data and an authorized existing connection without new charges.

## Parts and local branches

Create a verified `codex/hackathon-integration` baseline. Reuse matching branches or choose unique suffixes; never overwrite existing branches. Create feature branches lazily from the tested integration SHA that contains their dependencies. Use external worktree paths such as `../Job-apply-extension-worktrees/`, each with its own dependencies, build outputs and isolated browser profile.

| Part | Branch | Deliverable and dependencies |
| --- | --- | --- |
| H0 | `codex/hackathon-contracts` | Baseline, ownership and versioned fact/request/approval/library/plan contracts |
| H1 | `codex/hackathon-fill-core` | Native scan/preview/fill/readback and identity guards; after H0 |
| H2 | `codex/hackathon-answer-evidence` | One real AI route, reply validation, sentence sources and review UI; after H0 |
| H3 | `codex/hackathon-approved-answers` | Library, scope/revision checks, reviewed reuse and approved textarea integration; after H1–H2 |
| H4 | `codex/hackathon-verification` | Integrated browser/failure tests, audit triage and fixes; fixture work may start early, gate follows H3 |
| H5 | `codex/hackathon-release` | Fresh-checkout candidate, setup, evidence, disclosures and demo script; after H4 |

An integration lead owns shared types, storage, background entrypoints, manifest and UI wiring. Assign separate workers only independent scopes with explicit ownership; otherwise work sequentially. Local scoped commits and integration into the local integration branch are part of this task. Publishing, changing visibility, merging protected/default branches and event submission are separate actions.

For every part: state acceptance behavior and owned files; implement meaningful regression tests; run targeted tests, compile and relevant browser checks; self-review; commit only owned changes; report base/head SHAs, commands/results and limits. Integrate one passing branch at a time, then retest the merged behavior. Branch test success is not integration evidence. Do not remove safeguards or disable assertions to make checks pass.

## Required verification

| Case | Expected evidence |
| --- | --- |
| Genuine AI | Actual request/result with synthetic data, tool/version/date and reviewed sources; replay clearly labeled and not the only evidence |
| Provenance | Every reference opens the correct source revision; invented IDs, stale revisions and job-as-experience cases fail validation/review |
| Plausible unsupported claim | Known fixture example is visibly unsupported or blocked for correction; do not claim arbitrary semantic hallucination detection |
| Editing | Text edits revoke approval/source mapping; regeneration or profile/context changes cannot reuse an old approval |
| Save/reopen | Explicitly saved exact revision survives reopen; drafts are not silently saved; quota failure does not display success |
| Reuse | Same scoped answer can be reviewed and reused; cross-job, altered question/options, stale/deleted facts and conflicting candidates require review |
| DOM execution | Actual built extension fills expected empty visible controls and approved textarea; React rerender preserves values; overlength text is not truncated |
| Stale/concurrent state | Navigation, rescan, label/options changes, two tabs/jobs, repeat clicks and cancellation cannot cross-wire answers or replay blindly |
| Worker lifecycle | Idle-restored plan revalidates; interrupted execution reports partial/unknown, without automatic replay |
| Protections | Prefilled text/files, hidden controls, unsupported widgets, consent/signature fields remain untouched; no submission or Enter action |
| AI failure | Malformed/oversized/late/mismatched output, cancellation and unavailable provider preserve prior data and local autofill |
| Clean setup | Exact candidate installs/builds/loads and completes documented flow without the author's browser profile or private filesystem |

Keep unit/DOM tests, real-module integration tests, real Chromium extension tests and manual AI smoke evidence distinct. Retain existing fixture coverage, including frames/shadow roots where implemented. Do not introduce unimplemented widget support merely to fill a test matrix. CI must work without real model credentials. Inspect scripts before invoking them; run `npm run compile`, relevant tests/build, and `npm run check` for the release if still defined. Do not claim commands passed unless actually run. Count wrong writes, verified writes and manual outcomes separately; zero wrong writes on named fixtures is not universal accuracy.

## Grok audits and release

Use `docs/plans/2026-11-09-grok-github-audit-prompt.md`. Prepare one exact candidate SHA and a base SHA where diff review is useful. External GitHub auditors see committed accessible content only. Give all auditors the same snapshot and assign their different scopes. Do not send messages or publish source merely to initiate an audit without the owner's instruction.

Triage findings by evidence and reproducibility, not agreement count. Reproduce accepted issues, add a relevant regression case, fix on an owned branch and rerun affected integration/release checks. Record dismissed findings with reasons. Any changed candidate needs new verification; do not claim old audit results cover the new SHA. Missing source or unrun tests produce an incomplete audit, not a pass.

Aim for core integration November 12, feature cutoff November 13, fresh-checkout/rehearsal November 14, and submission materials ready November 15 by 6 PM PST. The recorded official deadline is November 15, 2026 at 11:59 PM PST; recheck official requirements before submitting. If behind, defer helper automation and other noncore features, not provenance review, approval/scoping or safe execution.

Prepare README/setup, synthetic fixtures, exact-SHA test/audit report, known limitations, no-purchase judge access instructions, prior/new work record, AI assistance/research/dependency credits and appropriate license information. Keep Jobright copied/extracted code, personal profiles, credentials and machine-specific research dumps out of public source/history. Use the main plan's official event checklist. Prepare a video script of at most three minutes for recording inside HackerSquad; an external video alone is not the documented submission path. Clearly identify samples/replays and unfinished features.

Suggested video: problem and synthetic profile (20s), real AI request/draft and clickable sources (60s), edit/approve/save/reopen (40s), preview/fill/readback and unsafe/stale reuse prevented (40s), scope/contribution/setup (20s). Rehearse actual timing; do not hide manual copy/paste steps if used.

Finish with the release location/SHA, integrated branches, completed core behaviors, exact test/audit evidence, judge access status, remaining defects/limits and human publication/submission actions. No “foolproof” or guaranteed bug-free claims. Preparing a submission is not submitting it.

---

## Short launch prompt

```text
From the repository root, execute
 docs/plans/2026-11-09-hackersquad-build-handoff.md
and the authoritative hackathon scope in its linked plan.
Build the small source-visible AI answer → review → approve → save →
reopen/reviewed reuse → preview/fill/verify flow. Use the H0–H5 branches
and isolated worktrees, preserve concurrent work, and test each part and
its integration. Defer broad ATS coverage, résumé tailoring and materials
UI. Prepare an exact-SHA release candidate, Grok audit inputs and a
three-minute HackerSquad demo. Continue through implementation and
verification; report evidence and limits. Do not publish or submit yet.
```


## November 11 follow-up: résumé import and reusable projects

The owner prioritized getting the private Profile home populated from a résumé, with project and experience notes reused by the extension. Uploading a PDF, DOCX or TXT extracts text locally and proposes supported ordinary fields and verbatim source notes. Existing nonblank values remain; imported edits require review and Save profile before Autofill uses them. The résumé attachment is saved separately and immediately. Do not infer eligibility, demographics, earned degrees, current employment or missing graduation dates. Scanned-image OCR and résumé tailoring remain out of scope.

LinkedIn account connection and profile import were explicitly deferred to a later feature. Keep the existing LinkedIn URL field. Do not register an app, add OAuth credentials/backend, claim a connected account or publish/deploy for this scope.

Record browser persistence and same-profile sidebar reuse, a packaged PDF worker smoke, unsupported/malformed-file handling and duplicate import preservation with synthetic fixtures. Keep real résumé data and live application snapshots outside the repository and public audit package. Phone/résumé readback succeeded in the live 0.3.0 Databricks test; custom dropdowns required a bounded keyboard-event correction and must not be described as live-verified until retested. Submission remains manual.


## November 11 follow-up: checkbox questions in the sidebar

The owner requested that checkbox groups also appear when Autofill cannot complete them. Report each visible native checkbox question in the chosen application form once under Needs your attention, using its group question rather than one row per option. Include standalone consent checkboxes as manual review items. Preserve every checked and unchecked state; do not infer location preferences, sanctions/export-control answers or consent from profile facts. Existing selections do not prove a group is complete.

Keep these observations separate from writable controls and AI questions, validate and bound page-supplied labels/counts, and refresh after basic writes for newly revealed groups. Exclude hidden, authentication/search and unrelated form controls. Tests must cover grouping, duplicate names across forms, existing selections, dynamic visibility, persisted sidebar results, zero checkbox events and no submission. Bounded native detection does not establish universal custom-widget or cross-origin coverage.

The prior 0.3.1 live Databricks test verified country/city and flagged an unmatched school, but omitted three checkbox questions from its count. The checkbox follow-up requires its own clean release checks and live retest on the exact new candidate. Keep personal profile and application evidence outside the public source snapshot.


## November 11 follow-up: live résumé preview and reusable answer controls

The owner requested a Jobright-like résumé preview from the reusable home profile, using the existing template, with optional education and switches for different uses. The preview formats current draft facts locally, includes all notes by default, allows per-note Experience/Projects placement and inclusion, and offers editable DOCX and browser Print/Save PDF. Keep the uploaded application résumé unchanged until the user replaces it. Preserve wording and source scope; do not manufacture credentials, dates, metrics or current employment. Display overflow instead of shrinking or truncating to imply one-page completeness.

Application autofill switches are separate from résumé inclusion. Saved location, education, current company/title and eligibility can be disabled without erasing values. New explicit citizenship-country, nationality and U.S.-citizen answers start blank, are independent of residence/work authorization, and only map conservative simple questions. Feature approval is not a factual citizenship answer. Compound legal/export/sanctions declarations and checkbox groups remain manual. All experience notes can appear in the preview and support reviewed AI drafting; structured repeating employment fields still need a separate ATS adapter.

Verify live editing, saved layout persistence, stale-editor conflict handling, local-only Word export, print layout, narrow/mobile layout, unchanged attachment storage, default migration, section gates at planning/execution, and no citizenship inference. Keep personal preview documents and live profile data outside the committed/public snapshot. This new candidate needs its own exact-SHA test evidence; earlier audits and live Databricks tests do not certify it.


## November 11 follow-up: AI-created résumé and cover-letter previews

The owner explicitly requested AI to pull the saved information and create documents for a job posting plus career direction, then show a preview. This supersedes earlier exclusions on résumé tailoring and cover letters for this bounded home workflow. The home offers one Create résumé & cover letter action, Base/Tailored/Cover-letter preview tabs, editable generated wording, source/missing-information review, and local Word/PDF export. The base profile, factual notes and uploaded application résumé are never overwritten.

Use the existing signed-in Codex/Claude helper with no app credits or paid fallback. Its new materials capability is checked before evidence transfer. AI receives included experience/project facts, optional education/skills, and target text. Contact and eligibility profile fields stay local; source identity uses SHA-256. Employer/title/date/link headers remain immutable local data. Generated summary, bullets and letter paragraphs reference saved evidence; entry bullets cannot borrow another employer's fact. Grounding checks are bounded review aids, not semantic proof.

Store generated drafts separately with source/target hashes, exact-content review fingerprints and optimistic revisions. Edits invalidate review. Source or target changes require regeneration before download. Expired inference requests must not erase saved documents. Cancellation discards late replies; storage acknowledgement briefly locks the editor so it cannot overwrite newer text. Keep profile import and basic Autofill usable when the helper is unavailable or older.

Verification includes strict response/citation handling, preserved headers and attachments, stale edits, helper capability negotiation, cancellation, print/Word layout and an actual synthetic Codex request with no tools. Recorded response replay in browser tests is explicitly separate from the real native smoke. Do not send personal data for development smoke tests, install/upgrade the live helper, submit applications, or publish this candidate as part of this implementation step.


### Preferred first name

Profile home also stores an optional preferred first name, blank by default. Résumé and cover-letter names/signatures use it when supplied and otherwise use the regular first name. Autofill uses it only for explicit preferred first/given-name text questions; ordinary and legal first/full names keep the original identity. Ambiguous preferred-name questions remain manual. This value stays local during document generation, and changing it makes existing tailored documents stale until regenerated.
