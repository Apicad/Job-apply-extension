# Actual model response: synthetic copy/paste smoke

Performed **November 9, 2026, 9:35 PM Pacific** (result timestamp `2026-11-10T05:35:03.659Z`). Code base was H4 `96af47631494a9292db430e60c520546fb06b4d7` plus the H5 review-workspace button and manual smoke runner. The final candidate will be tested separately from a fresh checkout and identified in the external exact-SHA handoff.

- **Connection:** this already authorized Codex desktop conversation. The assistant read the exact request exported by the extension and generated the two answer sentences and their JSON response. This was not a replay of the deterministic test response. No additional provider API, API credential, subscription purchase or credit purchase was used. The existing chat's ordinary usage accounting is outside this runner.
- **Model identification:** Codex/GPT-6 family per the session instructions. The exact backend deployment/version was not exposed; no more specific model ID is asserted.
- **Runtime:** Node 24.15.0, WXT 0.21.5, Playwright 1.65.0, Chromium 158.0.8127.18, isolated synthetic profile. Browser operations were driven by `scripts/manual-ai-smoke.mjs` against the actual built extension.
- **Request:** `smoke/request.txt` and `request.json`, request ID `146a9ae1-ec95-4ed6-80a9-b5e3c1153548`. Two applicant facts, separate reviewed job context, opaque application/question fingerprints; no contact fields, files or credentials.
- **Actual response:** `smoke/response.json`. The first sentence paraphrases `demo-project-build` revision 1; the second paraphrases `demo-project-tests` revision 1. Neither asserts employer experience, credentials, results, dates or metrics beyond those facts.
- **Review:** the coding assistant compared both generated sentences with the exact originals, then the synthetic UI flow checked the review confirmation. This is agent-run test review, not a claim that the applicant or an independent person approved a real application.
- **Observed result:** `smoke/result.json`: one explicitly saved answer, reopening succeeded, six verified writes, exact textarea equality, no submission. `source-review.png` was visually inspected; both expanded references display the intended original snippets. `filled-sample.png` records the resulting synthetic page.

The automated suite uses deterministic external-boundary responses and no provider credentials. The committed real response is a historical fallback/evidence artifact; its expired request ID cannot be pasted into a newly generated request. A new live demo must obtain a new response.

## No-purchase judge path

Use the same manual copy/paste route with an available free chat allowance. Official pricing and quickstart pages were fetched November 9, 2026: https://learn.chatgpt.com/docs/pricing and https://learn.chatgpt.com/docs/quickstart. They document a $0 Free plan and a signed-in chat flow, subject to limits/rollout. The extension itself needs no service account, API key, paid library or hosted backend.

**Verification limit:** a fresh free judge account was not created or exercised. The real smoke used the existing authorized Codex conversation, not a newly provisioned free account. Confirm free-account access and available allowance before the human submission; if unavailable, arrange an authorized no-purchase judging session. Do not claim that the model is bundled or that a replay is live AI.

## Later candidate evidence

The artifacts above are historical and do not certify the audit-cycle candidate. For a later exact-SHA smoke, run `scripts/manual-ai-smoke.mjs` from a clean committed checkout with `JAA_SMOKE_DIR` pointing outside the repository. Its result includes the tested SHA and clean status; it refuses an existing response file. Store the actual prompt, response, source-review screenshot, result and execution log beside that candidate's external release handoff. This avoids changing the tested commit to record its own hash. A same-session Codex response remains disclosed model evidence, not an independent free-account judge rehearsal.

## Public audit evidence for cycle 2

The previous filesystem-only handoff did not reach the external reviewers. Cycle 2 publishes a separate evidence-only commit on `codex/audit/evidence-cycle-2`. The final handoff supplies its immutable GitHub link and the separate exact tested source SHA. Its sanitized summary, test results and fresh synthetic request/response/result/screenshots identify the tested source commit, not the evidence commit. Historical artifacts in this folder remain historical.
