# Job Apply Assistant · HackerSquad candidate

Draft one application answer from saved experience, open the original sources behind each sentence, approve the exact wording, explicitly save it, and review what gets filled. **You submit manually.**

This small Chrome extension uses a manual copy/paste AI connection. It does not include a provider key, hosted backend, automatic submission or live LinkedIn sync. Basic native profile autofill works without AI.

## Setup

Use Node **24** (`.nvmrc`; verified with 24.15.0), npm, and desktop Chrome/Chromium. From the exact candidate checkout or supplied source archive:

```sh
npm ci
npx playwright install chromium
npm run check
npm run build
```

`npm run check` type-checks, runs the unit suite, builds the E2E extension and launches isolated Chromium profiles against local synthetic fixtures. No model credential is required. The fixture server uses its own loopback port and refuses another checkout's server. `npm run build` writes the production extension to `.output/chrome-mv3`.

1. Create a separate Chrome profile for this synthetic demo. Open `chrome://extensions`, enable Developer mode, and **Load unpacked** → `.output/chrome-mv3`.
2. Run `npm run fixtures`. Open [the sample application](http://localhost:5179/hackathon.html). It is labeled synthetic and never sends an application.
3. Click the extension toolbar icon on the sample page. This explicit click grants access to that tab. Choose **Open review workspace** to keep the review screen open while switching to your AI chat. The workspace remains bound to the original application tab.
4. Choose **Load synthetic applicant**. It refuses to overwrite a nonempty saved profile. Existing profile keys/files from other development streams are preserved.

The production manifest has only `storage`, `activeTab`, and `scripting`; no passive content scripts, broad host access, analytics or extension-origin AI requests. The E2E-only build permits localhost fixture origins. Do not distribute that test build as the production extension.

## Complete demo flow

1. **Scan application**. Review the native-field preview; the page is unchanged.
2. Select **Describe a relevant project.** (the other supported wording is **Tell us about a project you built.**). Other free-text questions remain manual.
3. Enter reviewed job context and select the relevant saved facts. Keep requirements distinct from personal experience.
4. **Preview exact AI request**, read the entire payload, then **Copy reviewed request**. Paste it into an authorized AI chat; request JSON only. Copy its actual JSON back to **Paste AI JSON response**, then **Validate response**. If clipboard access fails, copy the visible payload manually. Requests expire after 30 minutes; cancel or preview a new request to replace one. No automatic retries occur.
5. Open every **Source** link. Compare each sentence with the original snippet and revision. Missing support, unfamiliar technology/credential terms and unsupported numbers are flagged. These bounded checks do not establish factual correctness. A model can cite a valid fact while making an unsupported claim; your review is essential.
6. Edit as needed and choose **Apply edits for review**. Edits revoke approval and current sentence mappings; the original trace remains visible. Check the review confirmation and **Approve exact answer**.
7. Select a save scope and **Save approved answer**. Default is the current application. Only factual project experience may be marked reusable, and using it elsewhere requires new approval. Approval, saving and filling are separate actions.
8. Close/reopen the extension. Inspect **Saved answers**. To reuse: scan/select a current question, preview its current context, then **Open for review**; approve and explicitly save the reviewed revision again. The library persists across browser restarts; unsaved review state is session-only.
9. **Preview approved textarea fill**, inspect the exact text and all other planned values, then **Fill previewed fields**. Review the per-field verification results. Files, existing answers, consent/signatures, hidden controls and custom dropdowns remain untouched.
10. For a safety demo, prepare a pending answer fill, edit its saved fact, then try that old preview: it is rejected. Changing jobs/questions, rescanning or deleting an answer similarly prevents stale reuse. After navigation or a browser restart, scan again.

## AI access and evidence

The copy/paste route requires no paid integration or repository secret. An account with an available free chat allowance is the proposed judging route. Official [ChatGPT pricing](https://learn.chatgpt.com/docs/pricing) lists a $0 Free plan; [the quickstart](https://learn.chatgpt.com/docs/quickstart) describes signing in and starting Chat. Availability, rollout and rate limits vary. **A newly created free judge account was not exercised here; confirm its access before submission. Do not purchase credits to run this demo.**

[Real AI smoke record](docs/hackathon/AI-SMOKE.md) distinguishes the actual Codex-generated response from automated test stand-ins. The committed response is historical evidence, not a live response for a new request ID. To run a new smoke with your authorized AI chat:

```sh
npm run build:e2e
JAA_SMOKE_DIR=/tmp/jaa-new-smoke node scripts/manual-ai-smoke.mjs
```

Use an empty directory. Read its `request.txt`, obtain a real response in your AI chat, and write that JSON to `response.json`. The runner does not call a provider or fabricate a response. It uses synthetic data and a new isolated Chromium profile, then exercises validation/review/save/reopen/fill through the UI. The assistant's synthetic review in the recorded smoke is not a claim of independent human certification.

## Scope and limitations

- One selected project textarea; exact supported question wording. Native text/select/radio fields use existing conservative classification and explicit saved profile choices. Synthetic defaults leave sensitive choices blank.
- File attachment, custom widgets, cross-origin embeds, multi-step navigation, résumé tailoring, cover letters, broad ATS guarantees and LinkedIn import/sync are not implemented in this release. Existing résumé utilities/tests remain intact.
- Text readback is exact, including a 100 ms delayed check. Unexpected masks/transforms are reported unverified. Sites may change values after that window; inspect the final form. No automatic write retry.
- One best application-like form per scan. Unknown/unsupported fields remain manual. This is not a semantic hallucination detector or universal form recognition.
- Saved answers depend on their original fact revisions. Changed/deleted facts require a new draft; this release intentionally has no automatic migration of stale evidence.
- Storage failures and malformed/unknown library schemas fail visibly and preserve prior data. Capacity is 100 answers with no silent eviction. No automatic corruption repair.
- Public release and independent audit are pending. The final SHA and fresh-checkout results are in the exported `RELEASE-HANDOFF.md` alongside the exact source archive. **Do not audit main as a substitute.**

See [authoritative scope](docs/plans/2026-11-09-jobright-inspired-autofill.md), [build handoff](docs/plans/2026-11-09-hackersquad-build-handoff.md), [audit instructions](docs/plans/2026-11-09-grok-github-audit-prompt.md), [preliminary finding triage](docs/hackathon/AUDIT-TRIAGE.md), [contributions and license status](docs/hackathon/CREDITS.md), and [three-minute demo script](docs/hackathon/DEMO.md).

## Audit cycle 1

See [finding dispositions and verification limits](docs/hackathon/AUDIT-CYCLE-1.md). The canonical branch is `codex/release/candidate`; current fix branches use `codex/fix/<purpose>` and integrate through `codex/integration`. Older branch names in historical plans/worklogs describe their original checkpoints.

On a clean committed checkout run `JAA_REQUIRE_CLEAN=1 npm run check`, then `npm run build`. The Playwright JSON report records the exact SHA, tree, branch and dirty status; the release flag refuses a dirty tree. Development test runs remain allowed and are explicitly marked dirty. `node scripts/e2e.mjs` now adds the local tool binaries to PATH. Use `npm run test:e2e` to build first.

An executed, interrupted or invalidated fill plan cannot be previewed again. Inspect the page and scan again before reusing a saved answer. The UI distinguishes refused writes, attempted but unverified writes, verified writes, and unknown/unreachable outcomes. "Verified" covers immediate readback plus the existing 100 ms window only.

Edits rerun the bounded numeric/technology checks against selected applicant facts, keep original missing notes visible, and remove sentence mappings. To resolve missing notes after correcting the answer, explicitly confirm their resolution; this is human review, not automated factual verification. Cross-application reuse creates a new record and preserves the original reusable answer.

Synthetic loading requires absent raw profile and fact storage. If a saved-answer library is damaged, valid records and facts remain visible, while library mutations fail closed. Use **Inspect raw library**, optionally **Export raw library**, then explicitly confirm **Recover saved answers**. Recovery keeps the entire original envelope in local quarantine and restores only valid, unique records of the supported schema. Quarantine is preserved by later saves/deletes; it is not sent anywhere. An unknown schema recovers no records but retains its complete original data.
