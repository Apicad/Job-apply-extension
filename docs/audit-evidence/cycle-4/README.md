# Cycle 4 exact-source verification evidence

Tested product source: **`f3b7ef0d5dd3f1be9a16753a643e209665797b60`**, tree **`430532932d2fa0e08034c5c3eacaddb27c290f0e`**.
[Source](https://github.com/Apicad/Job-apply-extension/tree/f3b7ef0d5dd3f1be9a16753a643e209665797b60) · [C4-1 disposition](https://github.com/Apicad/Job-apply-extension/blob/f3b7ef0d5dd3f1be9a16753a643e209665797b60/docs/hackathon/AUDIT-CYCLE-4.md)

This separate evidence-only commit is based on the source above. Its own SHA is not the tested product SHA. Both authoritative plans and the audit instructions are committed in that source; do not substitute main or an earlier candidate.

## Focused change and reproduction

Only lib/hackathon/answers.ts changed at runtime. Request creation, preview and execution now share the target-context derivation. At both gates, application/question identity derived from the current plan URL, row job snapshot and target descriptor/form/length must match the session and saved approved context. Existing saved identity/revision/approval/fact checks remain.

C4-1 required privileged extension-context edits to storage.session. Four cases reproduced acceptance before the fix: Q1 to Q2 and application A to B, before preview or after preview and before execution. After the fix all four refuse before any native/textarea write, keep the library unchanged and leave no outcomes/submission. Three positive controls confirm same-question, cross-question and factual cross-application reuse with explicit review, approval and save. **No page-content or normal UI/message exploit path was demonstrated.** This is not a claim of protection against a fully privileged actor changing every trusted value.

## Executed release gates

A fresh independent clone was detached and clean at the exact source SHA. It passed npm ci, `JAA_REQUIRE_CLEAN=1 npm run check` (**typecheck, 19 unit files / 4,154 tests, 44 actual-extension Chromium tests**), production build (**450.30 kB**), and the source exporter. Browser results have zero failed/skipped/flaky tests. All **140 source files** in source.zip were compared byte-for-byte with Git; its comment matches the source SHA, and its baseline is a verified ancestor. Both plan documents are included. Per-file source and production-build hashes are supplied for reproduction.

The pre-commit full suite also passed. One earlier run was interrupted before completion and is not claimed as passing. Targeted red/green logs show four failures plus three controls before the fix and seven passes after. Logs redact local paths, remove terminal control codes and trim trailing whitespace. The runtime permissions remain storage/activeTab/scripting, with no host permissions or content scripts.

## Fresh model smoke

The current Codex chat read the newly exported request and authored the two-sentence JSON response in smoke/response.json. Both claims were compared to their original synthetic facts before automated review confirmation. No old response was replayed, no provider API or credential was used, and no additional model purchase was made. The exact backend identity is not independently attested.

The actual popup validated the response, showed sources, approved and explicitly saved the exact answer, closed/reopened, previewed and filled. Result: **one saved answer, successful reopen, six verified writes, exact textarea readback and no submission**. Both screenshots were visually inspected. Prompt, response, validated draft, result and screenshots are supplied; this does not claim that either Grok executed the live model smoke.

## Reproduce and limits

Detach a clone at `f3b7ef0d5dd3f1be9a16753a643e209665797b60`. Use Node 24, npm ci, `npx playwright install chromium`, `JAA_REQUIRE_CLEAN=1 npm run check`, then npm run build. Inspect and run scripts/export-candidate.mjs into an external directory. A fresh live smoke needs a new empty JAA_SMOKE_DIR and a new identity-bound response; supplied smoke files are historical evidence, not inputs to replay as a new model run.

The next audit should target C4-1 and the legitimate reuse/scope flows. Previous independently passing counts and reproducibility concerned parent a59c71b; they do not certify this new source. Semantic support remains human-reviewed, readback covers the documented 100 ms window, and free judge-account access, production toolbar/manual unpacked/branded Chrome rehearsal, license choice and recording/submission remain manual or owner gates. No main merge, visibility change, paid model API or live submission. AI connectors remain queued separately.
