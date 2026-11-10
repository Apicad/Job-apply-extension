# Cycle 3 exact-source verification evidence

Tested product source: **`a59c71bca9860e2e2938feedc9ad7e6afc545d21`**, tree **`722bb583514baa6c92877e1ba6c3b71a335e6292`**.
[Exact source](https://github.com/Apicad/Job-apply-extension/tree/a59c71bca9860e2e2938feedc9ad7e6afc545d21) · [Finding dispositions](https://github.com/Apicad/Job-apply-extension/blob/a59c71bca9860e2e2938feedc9ad7e6afc545d21/docs/hackathon/AUDIT-CYCLE-3.md)

This evidence-only commit is based on that exact source. Its own SHA is not the tested product SHA. Use the source SHA for code review and reproduction; do not substitute main, a previous candidate, the evidence commit or a moving branch head.

## Results executed by the builder

A fresh independent clone, detached and clean at the source SHA, passed `npm ci`, `JAA_REQUIRE_CLEAN=1 npm run check` (typecheck, **19 unit files / 4,154 tests, 37 actual built-extension Chromium tests**) and `npm run build` (**450.09 kB**). There were no failed, skipped or flaky browser tests. See browser-results.json and verification.json for the exact SHA/tree metadata. Sanitized full logs are in logs; local paths and terminal codes were removed and trailing whitespace trimmed.

All **138 source files** in the export were compared byte-for-byte to Git, including both authoritative plans and the audit instructions. SOURCE-FILES-SHA256.json records their hashes. The new exporter writes mapped baseline `949c96ab064fff73c638d9c8e73b45f12f66a453` and verifies that it is an ancestor before creating artifacts. export-ancestry-check.json records pre-commit execution of the updated script from a clean corrected-history checkout and rejection from clean old non-descendant history before writing artifacts. The final committed script's export succeeded at the tested source SHA. PRODUCTION-FILES-SHA256.json records all built production files for independent comparison; permissions remain storage/activeTab/scripting, with no hosts or content scripts.

## New regressions and dispositions

Ten new browser cases were observed failing on the unchanged tree-equivalent baseline and then passing after fixes. Logs preserve both runs (development trees are labeled accordingly); the final clean run includes all previous tests too.

- **N7 fixed:** both preview and execution require exact saved identity, revision, text, approval and current source/context validity. Revision 1/2 × unchanged/changed job context reject preview until explicit Save, then successfully fill. Three persisted-boundary cases reject mismatched draft ID, stale saved context approval or absent saved approval before any write.
- **N8 fixed:** same/cross-application reuse shows the saved source ID/revision, states no new AI response was generated, separates current from original generation context, and retains the original snapshots through save/reopen/fill.
- **N1b limitation made clearer:** original source warnings stay visible beside edited prose explicitly labeled unverified. A one-word paraphrase still need not trigger blocking token warnings; human comparison remains required. No semantic-entailment claim is made.
- **D-A fixed:** updated and ancestry-checked export baseline, plus immutable mapping links in historical docs. **O4 withdrawn** by its auditor after confirming the existing guard. **D-B** unchanged main roots retain their historical identity, intentionally outside rewrite scope.

## Fresh response smoke

The current Codex chat read the new popup-generated request and authored the JSON response in smoke/response.json. This was an actual response to that request, not replayed prior evidence or a scripted provider call. The assistant compared both sentences to the two original synthetic facts before the automated review confirmation. The exact backend identity is not independently attested.

The actual popup validated the reply, displayed original sources, approved and explicitly saved the answer, closed/reopened, previewed and filled the synthetic form. Result: **one saved answer, reopened successfully, six verified writes, exact textarea readback, no submission**. The source-review and filled-sample screenshots were visually inspected. Prompt, response, validated draft, result and screenshots are all supplied. This is builder-generated evidence; neither Grok is claimed to have run the live model smoke.

## Reproduce and review limits

Clone, detach at `a59c71bca9860e2e2938feedc9ad7e6afc545d21`, use Node 24 and run `npm ci`, `npx playwright install chromium`, `JAA_REQUIRE_CLEAN=1 npm run check`, `npm run build`. Inspect and run scripts/export-candidate.mjs to an external directory. A new live smoke must use a new empty JAA_SMOKE_DIR and obtain a fresh identity-bound response; these artifacts are historical once generated.

The [previous attribution mapping](https://github.com/Apicad/Job-apply-extension/tree/0374e354643f723c901c937f785b18077a11522d/docs/audit-evidence/attribution-2026-11-09) was independently verified by both Groks. That verification does not certify these new code changes. A fresh independent review of this source remains pending, along with free judge-account access, production-toolbar activeTab/manual unpacked/branded Chrome rehearsal, owner license selection and recording/submission. Multi-provider/Codex connections remain a separate next phase. No main merge, paid model API or visibility change occurred.
