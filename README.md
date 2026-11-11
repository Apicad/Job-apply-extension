# Job Apply Assistant · sidebar release

Open an application, click **Autofill**, and review anything left in the sidebar. Saved profile details and your résumé fill first; AI drafts appear beside the application. **You submit manually.**

This version builds on audited source `f3b7ef0d5dd3f1be9a16753a643e209665797b60`. Its new sidebar and local AI connection require their own review; earlier audit results do not certify these changes.

## Use it

Use Node 24 or newer and desktop Chrome. From this checkout:

```sh
npm ci
npm run check
npm run build
```

Load `.output/chrome-mv3` using Chrome's **Load unpacked** control. Click the extension icon on the application tab to open the persistent sidebar and grant access to that tab.

1. Open **Your details** and save your profile once. Add a résumé for attachment. Under **Experience for AI**, save up to 20 short factual notes about your work or projects. The résumé file is attached, not automatically parsed into these notes.
2. Connect an existing signed-in AI tool with the local helper described in [native-host/README.md](native-host/README.md). Enable AI from **AI connection**. Basic autofill works without it.
3. Click **Autofill**. The extension scans the page and fills supported, empty fields from saved information. Existing answers are preserved. It shows filled, kept and needs-attention counts.
4. Review any drafted project answers, expand the saved facts when useful, and edit if needed. **Use answer** approves, saves and fills that exact answer in one action. Unsupported claims and changed application contexts remain blocked.
5. Check the employer's form and submit there yourself. The extension never submits or accepts attestations.

There is no copy/paste JSON step, app credit balance, provider API key or paid fallback. AI uses the connected tool's existing account and remains subject to its subscription, organization policy and rate limits. Connecting a signed-in account does not establish that it can complete inference; request errors are shown in the sidebar without undoing basic fills.

## Data and execution

Profile and résumé stay in browser storage. When AI is enabled, only the saved experience notes, supported question, job title/company and opaque application/question identifiers are sent through a Chrome native-messaging helper to the selected local AI CLI. No browser cookies, complete page HTML, résumé bytes or authentication secrets are sent by the extension. The CLI manages its own existing sign-in. Helper requests have size/time limits and disconnect cancellation. No application-origin page can directly call the helper.

The production manifest uses `storage`, `activeTab`, `scripting`, `sidePanel` and `nativeMessaging`. The native connection permission is granted at installation so Chrome exposes its API to the background worker immediately; AI remains opt-in and the helper accepts only the installed extension origin. It has no passive content scripts or broad host permissions. The E2E-only build permits local fixture origins; do not distribute it as the production build. The production toolbar uses the normal action event to grant temporary tab access before opening the sidebar; Chrome's automatic sidebar toggle does not grant it. Validate this path in a real Chrome profile because fixture host grants cannot prove toolbar permission behavior.

## Checks and scope

```sh
npm run compile
npm test
npm run test:native
npm run test:e2e
npm run build
```

Browser tests use isolated Chromium profiles and synthetic applications. Native transport stand-ins are test-only; a live CLI smoke is separate evidence. Files are limited to 4 MB. Writes are checked immediately and again after 100 ms, including native validation state; sites can change values later. An interrupted operation is never automatically replayed.

Supported: conservative native text/select/radio fields, explicitly recognized résumé inputs, email confirmation, and the existing project-answer question wordings. The sidebar keeps uncertain fields visible for review. Custom dropdowns/typeaheads, repeating employment/education, cross-origin forms, new multi-step navigation, general free-text questions, résumé parsing/tailoring and universal ATS coverage remain outside this change. Sensitive choices are only filled from explicit saved answers, never inferred by AI.

The original [hackathon plan](docs/plans/2026-11-09-jobright-inspired-autofill.md) and [build handoff](docs/plans/2026-11-09-hackersquad-build-handoff.md) remain in the source snapshot. The legacy review page remains addressable for regression coverage; the toolbar opens the sidebar.

## Historical audited foundation

The records below describe the earlier multi-step review workflow and its fixes. Their passing results do not apply automatically to the new sidebar release.

## Audit cycle 1

See [finding dispositions and verification limits](docs/hackathon/AUDIT-CYCLE-1.md). The canonical branch is `codex/release/candidate`; current fix branches use `codex/fix/<purpose>` and integrate through `codex/integration`. Older branch names in historical plans/worklogs describe their original checkpoints.

On a clean committed checkout run `JAA_REQUIRE_CLEAN=1 npm run check`, then `npm run build`. The Playwright JSON report records the exact SHA, tree, branch and dirty status; the release flag refuses a dirty tree. Development test runs remain allowed and are explicitly marked dirty. `node scripts/e2e.mjs` now adds the local tool binaries to PATH. Use `npm run test:e2e` to build first.

An executed, interrupted or invalidated fill plan cannot be previewed again. Inspect the page and scan again before reusing a saved answer. The UI distinguishes refused writes, attempted but unverified writes, verified writes, and unknown/unreachable outcomes. "Verified" covers immediate readback plus the existing 100 ms window only.

Edits rerun the bounded numeric/technology checks against selected applicant facts, keep original missing notes visible, and remove sentence mappings. To resolve missing notes after correcting the answer, explicitly confirm their resolution; this is human review, not automated factual verification. Cross-application reuse creates a new record and preserves the original reusable answer.

Synthetic loading requires absent raw profile and fact storage. If a saved-answer library is damaged, valid records and facts remain visible, while library mutations fail closed. Use **Inspect raw library**, optionally **Export raw library**, then explicitly confirm **Recover saved answers**. Recovery keeps the entire original envelope in local quarantine and restores only valid, unique records of the supported schema. Quarantine is preserved by later saves/deletes; it is not sent anywhere. An unknown schema recovers no records but retains its complete original data.

## Audit cycle 2

[Cycle 2 dispositions](docs/hackathon/AUDIT-CYCLE-2.md) document the residual fixes. Unchanged original claims retain their cited-fact warnings after edits; genuinely changed prose has no inherited sentence citations, and the original warnings remain inspectable. Common “one of” and “one part of” discourse phrasing does not count as a numeric claim. These checks are bounded heuristics, not semantic verification.

Saved answers are replaced only for the same application **and question**. Other targets fork a new saved record after explicit review/approval/save. Legacy saved CR/CRLF text normalizes in a new reuse draft, before approval; its original trace stays unchanged. Exact readback still rejects meaningful page rewrites.

Fields with oversized descriptors, placeholders or option values that cannot be signed whole are excluded from the automatic scan and may not appear in the preview. Inspect the entire application yourself; absence from the preview is not a claim that a field is completed.

The release handoff supplies separate immutable links for the exact **tested source commit** and its **evidence commit**. Each evidence commit adds only sanitized evidence documents to its source; it is not a replacement source candidate. Its committed summary names the tested SHA, clean-checkout counts, actual smoke provenance and remaining manual gaps, with the fresh request/response/result and screenshots available to reviewers. Cycle 2 evidence uses `codex/audit/evidence-cycle-2`; later cycles have their own evidence branch.

## Audit cycle 3

[Cycle 3 dispositions](docs/hackathon/AUDIT-CYCLE-3.md) cover explicit save enforcement and visible reuse provenance. Both preview and execution require the exact saved record and current approval, independently of coincidentally matching revision numbers. Reuse always requires a fresh review, approval and explicit save. The current job context is separate from the original AI request context displayed in the trace.

Edited wording is not verified against sentence-level sources. Original warnings stay visible for review even if a paraphrase no longer triggers the bounded checks. They may have been addressed by an edit, but the extension cannot determine that automatically; compare the exact answer with the original facts.

## Audit cycle 4

[Cycle 4 disposition](docs/hackathon/AUDIT-CYCLE-4.md) covers one bounded persisted-state consistency repair. Preview and execution rederive the approved application/question identity from the current plan and target row. A privileged session edit cannot redirect an otherwise valid saved approval to a different target merely by changing row/plan references. No page or normal UI reachability was demonstrated. Legitimate explicit reuse, review, approval and save remain supported; this does not claim protection from arbitrary modification of all trusted extension state.
