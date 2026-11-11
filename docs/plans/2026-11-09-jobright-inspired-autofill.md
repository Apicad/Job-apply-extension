# Job Apply Assistant: autofill, AI connection, and saved answers

> November 11 profile-home follow-up: the owner requested one home page for information entered once and reused across applications, instead of repeated chat questions. The extension home and sidebar share the existing saved profile, résumé and experience facts. Missing education or other answers are editable in that home and are never guessed. This follow-up also adds bounded Greenhouse dropdown/education handling and phone/upload verification fixes. Final submission remains manual. The README describes implemented scope; tests and live observations remain separate evidence.

> November 10 sidebar follow-up: the user authorized one-click saved-detail autofill, a persistent sidebar, and an existing-account local AI connection. This supersedes the manual copy/paste and separate approve/save/preview UI sequence below for the new sidebar. Generated answers still require an explicit review-and-use action; final submission remains manual. The original plan is retained here as foundation history. See the root README for current scope and setup.

Date: November 9, 2026. Updated November 9, 2026 for the smaller hackathon release: visible answer sources and explicitly approved answer memory. Status: implementation handoff; features below are planned, not implemented by this document.

## Outcome

Build an application assistant that drafts from saved experience, shows the exact facts behind each suggestion, remembers explicitly approved answers, and previews and verifies supported fills. The user reviews and submits the application. Basic profile autofill remains usable without AI.

The hackathon release demonstrates one complete workflow on a clearly labeled sample application with native controls and one short-answer textarea. Keep existing tested site coverage working, but do not require new Greenhouse, Lever, Ashby or Workday coverage to ship this release. Demonstrated fixture support is not proof of support for every live employer form.

This is an additive plan for the existing WXT extension. Preserve concurrent résumé, tailoring, application-log and fill-engine work, and reuse ready components. Their full feature sets are not prerequisites for the hackathon slice. This document is a plan, not evidence of implemented features, branches or passing tests.

### Authoritative hackathon scope

This section and the H0–H5 handoff supersede the broader milestone delivery sequence for this release. Milestones 0–9 below retain implementation detail and the longer-term roadmap; **their unchecked items are not all hackathon requirements**.

| Required in the hackathon release | Deferred from this release |
| --- | --- |
| Existing saved experience, stable fact IDs/revisions and a synthetic sample profile | New résumé generation/tailoring workflow, cover-letter generation and requirement dashboard |
| One real AI answer route with explicit payload preview and validated reply | Multiple providers and a new helper installer if a validated copy/paste route suffices |
| Sentence-level source references, exact source snippets and missing-information notes | AI field recognition and autonomous page operation |
| Edit/review/approve exact text; separate explicit save action | Automatic learning from every generated or typed answer |
| Simple saved-answer list, inspect, edit, delete and reviewed reuse | Semantic search, broad company/site reuse and advanced library organization |
| Native-control preview/fill/readback plus one approved textarea | Custom dropdowns, Workday navigation and repeating work-history rows |
| Application identity and current answer/résumé revision binding | Full materials dashboard, new application tracker and cover-letter packages |
| Synthetic browser tests, real AI smoke evidence, setup and submission materials | Broad new ATS adapter coverage or a production-scale service |

Use the existing planned helper only if it is already practical to integrate. Otherwise ship a validated copy/paste AI request/response route first. Both require a real model result, an honest description of the workflow, and a verified no-purchase judging path. A replay fixture alone does not meet the AI requirement. No new paid account, hosted backend or bundled provider credential is required by this plan.

### First optional addition: LinkedIn profile import

The owner would like LinkedIn to supply the starting experience if time permits. After the required flow passes its gates, prioritize a user-provided LinkedIn profile import over other stretch features. Start with pasted profile text; reuse an existing working PDF extraction path for a user-provided profile PDF if available. Do not build a new parser or account-sync service as a prerequisite for the core release.

Preview extracted experience and education before saving. Require explicit selection/confirmation, preserve original snippets and source locations, record import date and source revision, and avoid silently merging duplicate or conflicting facts. An import is user-provided information, not verification by LinkedIn. Keep provenance through answer generation; changes to imported facts invalidate dependent approvals using the existing contract. Do not import unrelated contacts/messages or automatically send the whole profile to AI. Use synthetic imports in tests and the public demo.

Label this capability “Import LinkedIn profile,” not live account connection or sync. Standard [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) provides basic identity rather than full employment/education history. LinkedIn documents [profile PDF export](https://www.linkedin.com/help/linkedin/answer/a541960/); retain pasted text when export is unavailable. Direct connection or continuous sync needs a separately verified authorized data-access route and remains later work.

Optional acceptance checks: import preview does not change saved facts; confirmation preserves source snippets; duplicates/conflicts require review; malformed/empty input reports an error; edited imported facts invalidate dependent answers. If this feature misses the core cutoff, document it as deferred and ship the core workflow.


### Source evidence: the central demo feature

- [ ] Give each selected saved-experience fact a stable ID, revision, original text and human-readable location, such as “Projects → Sensor dashboard → contribution.” These are user-provided facts, not independently verified credentials.
- [ ] Preview the exact selected experience, question and reviewed job context before generation. Keep job requirements separately typed from applicant facts: “the job asks for Python” is never evidence that the applicant used Python.
- [ ] Return a bounded structured draft with request/application/question identity, source revisions, ordered sentence segments, supporting fact IDs for each segment and missing-information notes. Derive displayed answer text from these validated segments so citations cannot silently refer to different prose.
- [ ] Make source references open the exact original snippet and its location beside the answer. Distinguish “saved experience,” “job context,” “user edit,” and “not supported by saved facts.” A generic AI badge or résumé filename alone is insufficient.
- [ ] Reject invented fact IDs, wrong request/context identities and stale source revisions. Flag absent support, contradictions and unsupported metrics for review. Reference validation does not establish that a sentence follows from its sources; the user must compare and approve the wording. Do not claim a hallucination detector or a factual guarantee.
- [ ] Missing personal information must remain a visible gap; the user can edit their saved facts and regenerate. A model must not invent accomplishments, eligibility, dates or numbers. Job/page text is untrusted data and cannot change tool permissions or the task.
- [ ] Editing invalidates approval and affected source mappings. Preserve the original generation trace, label the revision “user edited,” and require renewed source review. Never present inherited citations as verified support for newly typed claims.

### Approval and saved-answer contract

Generation produces a **draft**. Review and explicit approval bind an **exact text revision** for the current application. **Save approved answer** is a separate action; neither generation nor approval silently creates a reusable record. Saving does not fill or submit a form. An edit, regeneration, source change or relevant context change invalidates affected approvals and pending fill plans.

The minimal versioned record stores: answer ID/revision, exact text, original/normalized question and context fingerprint, compatible control kind, application identity, scope, source fact IDs/revisions, generation trace or user-authored origin, approval revision/timestamp, and creation/update timestamps. Approval must refer to this exact text revision; do not infer approval from the presence of text in storage.

Default scope is the current application. The only optional broader scope in this release is **reusable factual experience**, explicitly chosen by the user. Company motivation and job-specific claims remain application-scoped. On another application, a saved factual answer is only a candidate: inspect its sources, confirm its relevance and approve a new application-bound revision before preview/fill. Similar wording never authorizes reuse. Sensitive eligibility/demographic answers stay in the existing explicit profile/exact-choice path and outside AI drafting.

Provide save/list/inspect/edit/delete and persistence across extension reopen. Changed/deleted source facts mark dependent answers as needing review; deleted answers cannot enter new plans. Quota or malformed-record errors must preserve existing valid data and report failure honestly. Do not claim a successful save until storage acknowledges it.

### Scope decision for the building agent

The owner requested this smaller release, source-visible AI answers and approved answer saving. Reuse the [AI-tailoring design](../superpowers/specs/2026-11-09-ai-tailoring-design.md) and [résumé design](../superpowers/specs/2026-11-09-landing-experience-resume-design.md) where applicable; their complete workflows remain later work. This update supersedes the older AI-question/textarea exclusion only for a specifically reviewed answer. Preserve no automatic submission, no overwrite, no passive operation and no provider credentials or AI network calls in page scripts. Use existing uploaded résumé selection if the builder is not ready; bind its revision whenever it is included in a fill plan.

## Evidence and what it means

The investigation used REA 6.8.0 and direct static inspection of the locally installed Jobright extension **1.25.2**, copied separately from Chrome. No Jobright API was called and no application was filled or submitted. The web store listed a newer version; these findings describe the installed artifact only.

REA's full-bundle pass timed out on the large helper after preserving partial evidence. A focused pass parsed six extracted autofill modules successfully, but relationship/semantic coverage remains incomplete. Direct module inspection supports the pipeline findings; neither pass establishes runtime success or feature parity.

Prior investigation: the owner retains a private Jobright analysis report and inventory outside this repository. Those machine-specific research files and third-party bundles are not part of the public source export or implementation. See [research and contributions](../hackathon/CREDITS.md) for the portable disclosure.

Two paths must be kept separate:

1. **Main autofill:** ATS-specific handlers extract questions and options; the client sends normalized form elements to a background handler; the background calls Jobright's answer service; handlers apply returned answers through control-specific operations. It also includes streaming and dynamic-question handling. The server's internal matching/model logic is not visible in the extension.
2. **Separate discovery path:** a `jobright:discover-fields` message scans one selected form, collects native/ARIA control facts and label evidence, applies deterministic rules, and sends unresolved label candidates to an experimental endpoint. Returned proposals must refer to existing nodes and preserve observed control types. A changed DOM invalidates the result. This path was not established as the default main autofill pipeline.

Adopt the architectural lessons: evidence-backed field descriptions, shared control handlers, small ATS adapters, explicit answer provenance, and stale-state rejection. Implement them independently in the current TypeScript code. The extension's existing local-only design remains the default; it does not need Jobright's APIs, authentication, credits, telemetry, or remote configuration.

## Current project baseline

The inspected working tree was based on commit `111de8f`, with substantial uncommitted changes. This is a snapshot, not a claim that those changes are finished or tested.

| Area | Existing code to reuse | Work remaining at review time |
| --- | --- | --- |
| Shared data contracts | `lib/types.ts` | Add generation binding and richer explanation/coverage without changing existing profile meanings |
| DOM collection and descriptions | `lib/page/collect.ts`, `describe.ts` | Compose into a document scan; retain evidence provenance |
| Visibility and stale elements | `lib/page/visibility.ts`, `layout.ts`, `refs.ts` | Bind handles to a scan generation; validate question semantics before writes |
| Classification and answers | `lib/classify.ts`, `profile.ts`, `choices.ts`, `regions.ts` | Compose the pure planner and preserve conservative matching |
| Native DOM writes | `lib/page/fill.ts` | Compose action execution and verification; preserve React-compatible setters |
| Validation and persistence | `lib/report.ts`, `storage.ts`, `resume.ts` | Connect trusted background lifecycle and UI; extend boundary validation with new contracts |
| ATS identification | `lib/ats.ts` | Hostname detection exists; tested behavior adapters are a separate deliverable |
| Product flow | `entrypoints/background.ts` | Background is a stub; scan/fill entrypoints, popup, planner, and options flow were absent |
| Tests | Unit suites, ATS/React/frame/shadow fixtures, `tests/e2e/extension.ts` | Actual extension-flow browser specs were absent |

Read `CLAUDE.md` and `lib/types.ts` first. The current v1 rules deliberately exclude custom dropdown operation, location typeaheads, textarea answers, checkboxes, and multi-step navigation. Later milestones below are proposed v2 changes; do not silently expand v1 while wiring it.

## Architecture

```text
User opens popup and requests Scan
  → background injects read-only scan into permitted documents
  → page returns bounded field descriptions + scan identity
  → background validates, classifies, selects application forms
  → background resolves answers from saved profile and selected résumé
  → popup displays preview, sources, omissions and target origins
User presses Fill for that preview
  → background validates plan identity and current document
  → page rechecks each control and applies one approved action
  → page verifies result and reports outcomes
  → popup shows filled / kept / needs attention / rescan required
User reviews and submits
```

Keep three questions separate: **What is this control? What answer is justified? Can this control be operated reliably?** A recognized field can have no saved answer; a correct answer can belong to an unsupported widget. Neither case authorizes a guessed write.

The full profile remains in trusted extension contexts. Page scripts receive only descriptions to collect or the particular approved values/files needed for execution. An ATS adapter never reads profile storage or bypasses the shared planner/executor.

## Milestone 0 — Establish ownership and preserve current work

- [ ] Read current `git status`, `CLAUDE.md`, contracts, and the résumé/tailoring specifications. Check which missing files have since been implemented.
- [ ] Agree which stream owns changes to `lib/types.ts`, `lib/storage.ts`, `entrypoints/`, and `wxt.config.ts`; integrate completed work rather than building parallel replacements.
- [ ] Use the repository's pinned Node version. Avoid dependency changes unless a milestone demonstrates a need.
- [ ] Record the baseline compile and relevant tests once the active build permits running them. Do not describe existing fixtures or unit tests as proof of a working browser flow.

**Exit:** current module ownership and baseline failures are recorded; tasks below refer to the live tree.

## Milestone 1 — Complete the existing scan → preview → fill product

**Likely files:** implement missing `lib/plan.ts`, `lib/page/scan.ts`, `lib/page/apply.ts`, `entrypoints/scan.ts`, `entrypoints/fill.ts`; wire `entrypoints/background.ts` and the existing/assigned popup and options pages. Extend `lib/types.ts`, `lib/report.ts`, and `lib/storage.ts` through their owners.

- [ ] Compose `collectControls`, `isShown`, `describeControl`, `isEmpty`, `formIndex`, and `rememberControls` into `scanDocument`. Include job details and visible child-frame origins. The background derives inaccessible-frame reporting from those observations and injection results; page code cannot establish another frame's permission state.
- [ ] Build the pure `planPage`: select application form groups, classify fields, preserve existing answers, resolve text and exact unique choices, and emit both preview rows and actions. Keep unsupported fields visible in the report.
- [ ] Implement the trusted background controller: validate popup sender/request, inject scan on demand, validate every returned frame, create a plan, and store it in trusted session storage.
- [ ] Wire popup states: no profile, scanning, preview, filling, result, error, and rescan required. Display the actual answer, target field, résumé filename, and origins before Fill. Never fill directly from the shortcut.
- [ ] Implement `applyActions` using existing native writers; recheck identity, emptiness, visibility, enabled/read-only state, question meaning, and option identity immediately before every write.
- [ ] Deliberately configure the exact verified embed hosts from `lib/ats.ts`, or report/request access explicitly if the project selects optional host permissions. Do not add blanket all-sites grants. Keep fixture hosts test-only and do not add passive content scripts.
- [ ] Integrate existing profile/résumé storage and the assigned profile UI. Do not create a competing store or change existing profile field meanings.

**Critical contract work, before enabling Fill:** a request containing only `tabId` is insufficient. Add a unique `planId` to preview/fill messages and a `scanId` to each document's retained handle table and plan. Bind the plan to document identity, application URL/context, profile revision, and selected résumé identity. Profile revisions and résumé identity bindings are new work: define trusted revision updates or deterministic content fingerprints with the storage/résumé owners. Missing, expired or invalid plans require a new preview; never silently rebuild and execute an unseen plan. Serialize scan/fill per tab and prevent double execution of the same plan.

Reuse the existing `chrome.storage.session` plan store across normal MV3 idle restarts, but restore a plan only after all identity bindings still match. Persist an execution marker before writes and retain action outcomes. A restart during a fill yields partial/unknown completion and a rescan, not blind replay of actions whose outcome was lost.

`rememberControls` currently resets handles to zero on every scan. A ref must be interpreted only with its original `scanId`; an old preview must never address a newer table. Label/context changes also invalidate a planned answer, even when element id/name/type are unchanged. For select/radio actions, bind the index to the exact observed option labels/values and group membership.

**Exit tests:** preview changes no form values; Fill writes expected fixture answers; user edits survive; repeat Fill does not overwrite; rescan/navigation/two tabs/worker restart reject stale plans; no submit, checkbox, button/link activation or unpreviewed write occurs. React-controlled fields retain the answer after rerender.

## Milestone 2 — Make detection explainable and bounded

**Files:** extend `lib/types.ts`, `lib/page/describe.ts`, `collect.ts`, `refs.ts`, `lib/classify.ts`, `lib/report.ts`; consider a small pure `lib/field-evidence.ts` if it reduces duplication.

- [ ] Retain bounded evidence for labels: explicit label, `aria-labelledby`, `aria-label`, group legend, and scoped nearby context. Keep option labels separate from question labels.
- [ ] Add a deterministic explanation such as `explicit-label`, `matching-autocomplete`, `adapter-association`, `conflicting-hints`, or `missing-label`. Do not invent numeric confidence scores without calibration.
- [ ] Represent option coverage as complete/partial/unknown. A closed or virtualized menu is not an empty complete option list.
- [ ] Report scan limitations and truncation explicitly: unreachable frame, closed shadow root, collection budget, unsupported widget, or unseen conditional fields. An empty report must not imply complete inspection.
- [ ] Preserve current exclusions for hidden/password/search/signature/attestation/consent controls and current rules for sensitive questions. A plausible label is not sufficient evidence for a personal answer.
- [ ] Add per-field reason details to outcomes while keeping existing UI statuses compatible. Distinguish stale target, changed answer, rejected write, unsupported control, and unverifiable result.

**Exit tests:** duplicate labels, group-label versus option-label confusion, conflicting hints, recycled input with changed question, duplicate/reordered choices, open shadow roots, malicious page text, and budget truncation all produce the expected descriptor or explicit limitation.

## Milestone 3 — Introduce small, tested ATS adapters

**Suggested files:** `lib/page/adapters/contracts.ts`, `generic.ts`, `greenhouse.ts`, `lever.ts`, `ashby.ts`, and `registry.ts`. Add adapters only when existing generic logic fails a real fixture.

- [ ] Keep trusted hostname identification in `lib/ats.ts`. Page adapters refine form roots, label associations, control descriptions, and readback; they return facts, not arbitrary executable selectors or answers.
- [ ] Use a single shared descriptor/planner/action model. Avoid copying an entire filler for every site.
- [ ] Require both applicable origin and observed widget/form structure before using specialized behavior. Ambiguous detection falls back to conservative generic handling.
- [ ] Cover Greenhouse native/embedded forms, Lever's questions and uploads, and Ashby's native controls first. Report their unsupported custom controls honestly until Milestone 4.
- [ ] Track capability by control family, not a broad “ATS supported” badge. Hostname recognition alone does not establish fill coverage.

**Exit:** each adapter has fixture-based evidence of a concrete improvement and negative tests against unrelated forms. Generic behavior still works when the adapter does not apply.

## Milestone 4 — Add custom dropdowns as a documented v2 capability

This is the largest planned coverage improvement. Current v1 policy intentionally forbids it. Before implementing this milestone, revise the product contract narrowly for interactions within a verified choice widget; general button/link clicking and submission remain prohibited. This plan proposes that change but does not modify `CLAUDE.md`.

**Suggested files:** `lib/page/controls/combobox.ts`, `react-select.ts`, and shared bounded wait/cancellation helpers; extend descriptors, planned actions, message guards and preview UI through their owners.

- [ ] Start with single-select ARIA/React-Select widgets backed by a known complete set of currently observed options. Preserve native `select` handling.
- [ ] Separate option discovery from selection. If opening a widget is necessary, offer an explicit “Inspect choices” action with no selection or profile text entry, then show the resulting preview.
- [ ] Anchor listboxes through actual widget relationships such as `aria-controls`, including portals. Operate only the identified widget and option. Reject ambiguous lists.
- [ ] Require exact, unique option matching for saved answers. A search box containing the answer is not a committed selection.
- [ ] For typeaheads that require sending a search query through the site's own UI, defer until the user requests that interaction. Show what will be typed, inspect the returned choices, and require a fresh selection preview. Leave location manual until this flow is proven.
- [ ] Verify the committed label/value or selected chip after UI settling; handle disabled options, duplicate labels, menu rerender, timeout and cancellation. Do not choose the first available result.
- [ ] Keep checkboxes, attestations, remote AI answers, and automatic navigation outside this milestone.

**Exit tests:** selection sticks in real Chromium after framework rerender; wrong listbox/duplicate label/partial options are refused; user interaction cancels stale work; no unrelated control is activated. Update architecture tests narrowly for the permitted widget operations.

## Milestone 5 — Support dynamic forms without automatic navigation

**Suggested files:** `lib/page/observe.ts`, `lib/page/settle.ts`, background session coordinator, relevant adapters and browser fixtures.

- [ ] Observe relevant form changes only during an explicitly started scan/preview/fill session. Debounce observations; stop them on close, cancellation, navigation, timeout or completion.
- [ ] Invalidate previews when relevant labels, controls, options or form identity change. Do not invalidate for unrelated animation or decorative DOM churn.
- [ ] After a controlling answer changes available fields/options, stop affected pending actions and rescan. Newly revealed questions require a new preview; they are not silently appended to the approved plan.
- [ ] Use bounded condition-based waits and per-session cancellation rather than long fixed sleeps or endless retries. Keep outcomes for actions already applied.
- [ ] Provide “Scan this step” after the user clicks Next. Begin Workday with supported controls on the visible step; account creation, password entry, navigation and submission remain manual.

**Exit tests:** country/state dependencies, conditional authorization question, delayed listbox, rerendered field, disappeared form, cancellation, and two different application tabs cannot redirect an old answer. Report exactly what was applied before a partial failure.

## Milestone 6 — Connect AI and complete the existing tailoring workflow

**Hackathon subset:** one answer-drafting route and its validation/review contracts. Full tailoring, cover letters, requirement comparisons, provider selection and helper installation are later work unless already complete. The résumé builder is not a prerequisite for answer drafting.

**Dependencies:** reuse the tailoring stream's helper/request/validation work and the résumé builder. The connection and pure contract tests can be built separately from the fill UI; final integration needs Milestone 1 and the storage/UI owners.

**Suggested areas:** existing helper folder and connect/Tailor/review pages; task-specific pure contracts under `lib/ai/` or the tailoring stream's existing equivalent. Extend trusted background messages and storage through their owners. Do not create a second helper or résumé generator if these already exist.

- [ ] Build “Connect your AI tool”: choose Claude Code or “Another AI — copy and paste”; install the registered local helper, test connection, disconnect, and show uninstall instructions. Use the existing native-messaging design; request its permission at the user-facing connection step.
- [ ] Display disconnected, testing, ready, signed-out, helper-missing, incompatible-version, working, cancelled and failed states. Explain the next action. “Ready” means the connection test passed, not that every future request will succeed.
- [ ] Keep provider adapters behind a common task interface. Advertise supported tasks and tested capabilities. Reverify the actual installed tool's authentication and restricted execution before enabling automated use; do not silently substitute a different provider or paid API mode.
- [ ] Bind requests to `schemaVersion`, `requestId`, task type, application ID/context revision, and source-facts revision. Define separate payload schemas for tailoring, requirement comparison, field recognition and answer drafting. Outputs are suggestions, never executable code or DOM actions.
- [ ] Build an explicit request preview showing the recipient and exact permitted fields. Send only after the user presses the relevant Generate/Tailor button. Explain that a locally running helper can call a cloud provider; do not label this as offline inference.
- [ ] Preserve tailoring's field allowlist: job text and relevant saved experience; exclude contact details, sensitive application answers, credentials and résumé file bytes. User-entered prose can contain personal information, so show the actual payload rather than promising automatic anonymization.
- [ ] Use one deliberate generation per click, one active request per application/task, bounded input/output sizes, a configurable documented timeout and cancellation. Discard late or mismatched replies. Retrying is a user action; it must not silently produce duplicate generations or unknown charges. Show provider usage when reported without inventing cost estimates.
- [ ] Route pasted responses through the same schema, size, identity, provenance and review checks as helper responses. Include request identity in the copy/paste template. Invalid responses produce an explanation and preserve the previous approved material.
- [ ] Implement the existing tailoring workflow: choose relevant saved projects, propose wording changes, draft a cover letter and identify requirements not supported by the supplied experience. Show original versus proposed wording. Preserve saved profile/experience; use the existing builder to generate the approved résumé.
- [ ] Show requirement comparisons as supported, needs clarification, or not evidenced, with links to the job text and saved facts. Absence from saved experience does not prove a person lacks a skill; do not label the output a guaranteed ATS score.

**Exit tests:** a stand-in helper exercises success, missing installation, signed-out state, timeout, cancellation, malformed/oversized JSON, unexpected IDs, duplicate replies and stale application/source revisions. Copy/paste behaves identically. No request is sent before the button press, no profile changes on generation, and basic autofill still works when AI is unavailable. Automated tests use a stand-in, not a real provider or subscription.

## Milestone 7 — Save answers and corrections for controlled reuse

**Hackathon subset:** the minimal approval/library contract above. Field mappings, semantic search and company/site scopes are deferred.

**Suggested areas:** `lib/answers/contracts.ts`, `validate.ts`, `match.ts`, `resolve.ts`, a library page and preview editor; persistence through the existing trusted storage boundary. Reuse equivalent files if the active stream already created them.

- [ ] Provide create, edit, search, review, delete and explicit “Save this answer” actions. Generated content starts as a draft; generation and approval for one application do not automatically save it as a reusable answer.
- [ ] Distinguish a **field mapping** (this observed question means an existing profile kind) from a **saved answer** (approved text for a question). A mapping is a separate provenance source for otherwise unknown labels; it still obeys control compatibility, semantic-conflict, signature/attestation, sensitive-question and exact-choice guards.
- [ ] Store a versioned record containing `id`, revision, original and normalized question, context/group, control type, optional option-set signature, answer text or profile-field reference, provenance, approval/review timestamp, and scope. Keep company/job/app identifiers as structured scope, not inferred from free-form answer wording.
- [ ] Scope defaults to the current application. Offer explicit company/site scope and explicit reusable factual scope. Company motivation, salary expectations, relocation and dated claims stay application-specific unless the user deliberately changes their scope. Do not generalize sensitive answers using text similarity.
- [ ] Match only compatible scope, control type and exact normalized question/context or an explicit user-confirmed mapping. Semantic similarity may recommend a candidate for review; it cannot authorize a fill. Resolve using current local facts, then eligible approved answers; conflicts, multiple candidates or changed options require review instead of silently picking one.
- [ ] Track referenced facts and their revision. A changed profile, edited answer, changed question/options, or changed application context invalidates affected previews and requires renewed review. An old generated statement is not a permanent fact about the user.
- [ ] Keep demographic, work-authorization and sponsorship values in the existing explicit profile/choice flow. Do not generate them, infer them from résumé text, or include them in AI requests. Leave consent, signatures and attestations manual.
- [ ] Add bounded, validated storage with a migration version, corrupted-record recovery and quota-error messages. Do not silently evict approved answers. Saving an answer must not change profile facts; deleting it removes reuse eligibility and invalidates pending plans without editing a form already filled.

**Exit tests:** same question at different companies, ambiguous candidate answers, option changes, factual revisions, deleted records, duplicate normalized labels, malformed storage and quota failures have explicit outcomes. Draft/unapproved material never becomes an action. User-authored text remains editable and never overwrites an existing page answer.

## Milestone 8 — Review AI application answers and field suggestions

**Hackathon subset:** one non-sensitive short answer, sentence-level source review and its approved textarea path. Assisted field recognition is deferred.

This milestone implements the newly requested application-answer feature. It adds a narrow reviewed-textarea path; it does not enable generic AI page control or automatic filling of every textarea.

- [ ] Add “Draft an answer” for a selected non-sensitive application question. Show the exact question, company/job context, selected saved experience and requested length before sending. Basic examples are “Why this role?” and “Describe a relevant project.” Missing facts lead to clarification or an unanswered field.
- [ ] Return a bounded draft with `requestId`, application/question identity, answer text, supporting fact IDs, and missing-information notes. Validate references against the request and render plain text. Numeric/ID checks help flag unsupported additions but cannot prove that prose preserves meaning; require human review of the wording.
- [ ] Keep edited and generated drafts visibly distinct from approved answers. Provide edit, reject, approve for this application and a separate optional save-to-library action. Approval binds the exact text revision; a later edit or regeneration invalidates that approval.
- [ ] Show each preview row's question, proposed value, source (profile / saved answer / user edit / AI draft), supporting facts, uncertainty and target. Unapproved drafts cannot enter a fill plan. Existing reliable profile matches do not require a new AI call.
- [ ] For approved free text, extend the planner/action validators narrowly to bind the question snapshot, answer revision, textarea identity and character limit. Recheck emptiness, visibility and meaning before writing; verify readback. Overlength text returns for editing rather than being silently cut. Unsupported rich-text editors remain manual/copyable.
- [ ] Add assisted field recognition as a distinct task: send bounded observed label/type/option candidates without entered values; accept only existing snapshot/node/evidence IDs and allowed meanings. Preserve explicit labels/native types and known conflicts. Reject invented selectors, actions or options. The user confirms an uncertain mapping before local answer resolution and preview.
- [ ] Keep page strings and model output as data; neither may change the helper's instructions, access capabilities, selected provider, or submission controls. A model response never supplies executable instructions to the page.

**Exit tests:** invented/unknown fact IDs, plausible-but-unsupported claims, question swaps, stale responses, conflicting labels, changed draft after approval, injection-like text, overlength answers and prefilled fields are handled correctly. A complete fixture flow is draft → edit/review → approve → preview → fill → readback; no stage implies submission.

## Milestone 9 — Keep each application's materials together

**Hackathon subset:** application/question identity and answer/source/selected-résumé revision binding. The full materials screen, cover-letter package and new tracker work are deferred.

**Suggested areas:** integrate the existing application-log ID and storage interfaces; use a small application-materials record and screen rather than a parallel tracker. Consume the résumé stream's `WorkHistory`, selected-file and builder contracts.

- [ ] Associate an application ID with company/title, ATS job ID when available, canonical application URL/origin and a reviewed context revision. When identity is ambiguous, ask the user to select/create the application record; matching company/title alone is insufficient.
- [ ] Store a bounded snapshot of the reviewed job description plus references to selected résumé ID/revision, cover-letter draft/revision, approved answers, tailoring result and relevant fact revisions. Store large files once and reference them; never put file bytes in diagnostic logs.
- [ ] Provide an application review screen showing selected materials, missing required answers, unsupported fields, unverifiable writes and changes since the last review. Let the user return to the original résumé and edit or discard drafts.
- [ ] Pin the actual résumé artifact at preview and use the same artifact at Fill. Changing the selection, regenerating a file or changing jobs invalidates the old plan. A tailored file for application A is never silently attached to B.
- [ ] Preserve already attached files. Where observable, distinguish file selected, site accepted and acceptance unknown; local file assignment is not proof of upload success. Never infer application submission from field filling.
- [ ] Reuse the existing application log's states. Record draft/prepared/filled evidence separately from user-confirmed submission. On delete, explain whether approved reusable library answers remain, and remove app-scoped material references consistently.
- [ ] Leave adding/removing repeating employment rows manual initially. Consume the résumé stream's future work-history data for existing rows when separately supported, without filling every row with the same current job.

**Exit tests:** two tabs/jobs at one employer, changed URLs, ambiguous identity, changed résumé after preview, cancelled tailoring, deleted application records and cross-application answer leakage cannot select or fill the wrong materials. The review screen accurately summarizes partial completion.

## Dependency order and shared contracts

Hackathon delivery order: H0 baseline/contracts → H1 native fill and H2 AI/source review → H3 approved library and textarea integration → H4 integrated tests/audits → H5 release/demo. Execute independent parts sequentially unless workers with explicit ownership are available. See the [building-agent prompt](2026-11-09-hackersquad-build-handoff.md). Broader Milestones 3–5 and the deferred portions of 6–9 remain post-hackathon work.
Before parallel implementation, agree versioned contracts for scan/plan identity, task-specific AI request/reply, approved-answer revision/scope, and application/material identity. Give one owner to each shared file and integration point. Native-messaging/schema details must follow the installed provider and the existing design, not a guessed CLI command.

Useful implementation references: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Claude Code programmatic use](https://code.claude.com/docs/en/headless). Recheck provider flags/authentication when implementing; do not copy unverified commands into an installer.

## Verification and release gates

Use synthetic people and local fixtures. Do not use live applications or real AI services in automated tests. Maintain existing regression coverage, but add release tests for the authoritative hackathon scope only; the broader matrix below does not require implementing deferred widgets, providers or materials features.

| Test layer | Required evidence |
| --- | --- |
| Unit | Label/ARIA/group extraction; strict classification and option selection; bounds; stale-plan checks; outcomes and message validation |
| DOM fixtures | Greenhouse, Lever, Ashby, generic, hidden/hostile forms, frames, shadow roots, dynamic options and question changes |
| Real extension in Chromium | Scan/preview/fill message flow; isolated-world shared handles; React rerender; file attachment; cancellation; worker lifecycle; custom widget selection when enabled |
| AI and answer contracts | Stand-in helper and pasted responses; cancellation/late replies; evidence references; task limits; draft approvals; answer scopes and storage migrations |
| Application materials | Correct résumé and answer revisions across two tabs/jobs; delete/regenerate behavior; preview invalidation; partial results |
| Build/permissions | No passive content scripts, no broad new host grants, no production fixture origins, no extension-origin network or analytics |

Count **discovered fields**, **correctly classified fields**, **safe planned actions**, **verified writes**, **manual/unsupported fields**, and **wrong writes** separately. Record per-fixture expected results; do not claim arbitrary real-world accuracy from a small fixture suite. Release requires zero wrong writes in the maintained fixture suite and zero violation of submission/overwrite/visibility rules. Report unsupported coverage rather than hiding it.

For text readback, retain mask-aware handling but do not treat any nonempty value as universal proof of correctness: verify normalized phone/email/text semantics where known, and mark a result uncertain when the site transforms it in an unknown way. File attachment proves a local selection, not successful remote upload. A verified field write never proves successful application submission.

After implementation changes, run targeted tests, `npm run compile`, and the affected real Chromium specs. Before a release run `npm run check`. If existing unrelated failures are present, record them explicitly and do not claim a clean suite. This planning investigation did not run the target repository's tests or edit its implementation.

## Hackathon delivery scope and dates

Target: **HackerSquad AI Remote Hackathon**, not a HackerRank coding test. The event welcomes meaningful AI applications and existing projects with disclosed new work. In our judgment this project fits as an application-preparation assistant with visible AI suggestions and controlled execution. That is a product-fit assessment, not a claim of eligibility or a prize prediction. [Official rules](https://hackersquad.io/events/hackersquad-online-hackathon-1k-in-prizes/resources?tab=rules).

The confirmed deadline is **November 15, 2026, 11:59 PM PST**. Required deliverables include a public repository and exact commit, setup instructions, disclosures and a demo recorded **inside HackerSquad**, at most three minutes. Judges must be able to evaluate without purchasing a product. [Submission guide](https://hackersquad.io/events/hackersquad-online-hackathon-1k-in-prizes/resources?tab=submission).

The core demonstration is: load synthetic experience → select “Describe a relevant project” on a sample application → preview the AI payload → generate an actual answer → open sentence-level source snippets → edit/review/approve → explicitly save → preview/fill/read back → reopen the saved answer and demonstrate controlled reuse. Include a changed source or different job that requires renewed review, and leave an unsupported field untouched. Label fixture pages as sample applications.

**Must ship:** the authoritative scope above. Full résumé tailoring, cover letters, a materials dashboard and new ATS coverage are not release blockers. Preserve the existing safe fill engine and selected-file revision checks wherever used. One genuine, validated AI route is enough; resolve actual judge access early.

**Demo success evidence:** source snippets correspond to the approved answer revision; draft/stale answers cannot fill; a saved answer survives reopen; cross-job reuse requires approval; the expected empty field receives the exact approved text; no existing answer changes and no submission occurs. These are observable checks, not claims of universal reliability.

| Proposed checkpoint (PST) | Deliverable |
| --- | --- |
| November 9–10 | Owner-approved baseline, shared contracts, native scan/preview/fill slice |
| November 11 | One real AI route, sentence/source review and answer-library storage |
| November 12 | Approve/save/reopen/reviewed reuse and approved textarea integrated |
| November 13 | Feature cutoff; browser-flow tests, failure-path tests, judge setup rehearsal |
| November 14 | Release candidate from clean checkout; real AI smoke test, credits and video rehearsal |
| November 15, target 6 PM | Submission materials ready and human submission buffer; official deadline remains 11:59 PM |

These are planning targets, not time estimates or evidence of completion. If behind, cut stretch scope first and state remaining limitations.

### Judging and public-release gates

- [ ] Verify team registration and personal rule acceptance through the event's designated process; do not accept on another person's behalf. Existing-work and assistance disclosures must be accurate. [Builder guide](https://hackersquad.io/events/hackersquad-online-hackathon-1k-in-prizes/resources).
- [ ] Write a dated contribution record separating code that predated the build period from work added during it. A clean baseline plus scoped commits should support the explanation; do not reconstruct or backdate history.
- [ ] Disclose REA/source inspection as research, AI coding assistance and actual third-party dependencies. Independently implement the extension; exclude Jobright's copied bundles, extracted modules, private browser data and machine-specific research dumps from the public submission.
- [ ] Test the core from a fresh checkout of the release commit with synthetic profile/job data. Document exact Node/package-manager requirements, install/build/load-unpacked steps, AI setup and known platform limits. Resolve missing license/credits wording before public release; do not assume this repository is already licensed.
- [ ] Provide a real no-purchase judging route. Verify the copy/paste workflow with an accessible permitted AI tool, or arrange authorized secure test access. Do not require buying a Claude subscription, publish shared credentials, silently purchase API credits, or claim sample replay is live AI. If access is unresolved, record it as a release blocker while completing the rest of the build.
- [ ] Use a clearly marked recorded AI response only for deterministic test/demo recovery, alongside the functioning AI route and an actual smoke-test record. Do not use a mock as the only evidence of AI functionality.
- [ ] Record test commands, versions, outcomes and exact tested commit. Resolve crashes, wrong/cross-application writes, missing review, secret exposure and broken setup before release. List lower-impact known limitations honestly; never describe test passage as proof of being bug-free.
- [ ] Prepare the English submission description, problem/users, AI role, roster, source commit and disclosures. Rehearse and record the in-platform demo using synthetic data and the submitted build. Verify public repository access, recording playback and platform receipt. A saved project draft is not a submission. [Submission guide](https://hackersquad.io/events/hackersquad-online-hackathon-1k-in-prizes/resources?tab=submission).

Suggested story: show the applicant's repetitive work, demonstrate one complete reviewed AI/autofill flow, explain what the team built, and end with supported controls and known limits. Prioritize execution and usefulness: the published rubric weights technical execution 30%, usefulness 25%, originality/AI use 25%, and demo/UX 20%. [Builder guide](https://hackersquad.io/events/hackersquad-online-hackathon-1k-in-prizes/resources).

## Branches, test gates and building-agent handoff

Use the companion [building-agent prompt](2026-11-09-hackersquad-build-handoff.md). It divides the work into dependent parts, assigns separate branches/worktrees and test ownership, defines integration and release checks, and includes status-report requirements. The prompt is intended for the agent doing implementation; writing it has not created branches, run product tests, published the repository, or submitted anything.

Use the separate [Grok GitHub audit prompt](2026-11-09-grok-github-audit-prompt.md) against an exact candidate SHA. External auditors cannot inspect unpushed local work; provide the intended commit or an explicit source export. Audit findings inform fixes and retesting, not a guarantee of correctness.
