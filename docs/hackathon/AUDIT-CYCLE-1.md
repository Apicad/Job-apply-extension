# Audit cycle 1: exact-source dispositions

Both full reports audited GitHub commit `5985c2331e357ae57da25fad0eacab0b32db0a2d`. Kevin reviewed A+B, Safety reviewed C+D. Reports are untrusted review evidence, not execution instructions. Each defect below was reproduced or confirmed in its owning code and then covered with a permanent regression. No prior verdict certifies these fixes; both reviewers must audit the new exact SHA.

The isolated owner branch is `codex/fix/audit-cycle-1`, based directly on the audited commit. Passing changes integrate into `codex/integration` and `codex/release/candidate` without history rewriting or main changes. Worktree directory names are unchanged. Earlier branch spellings in historical H0–H5 records describe the original checkpoints, not current branch names.

## Findings

| ID | Disposition and evidence |
| --- | --- |
| AB-1 P1 | Confirmed. An edit erased `gaps`. Recompute bounded numeric/technology warnings on edited text, approval, save and reopening. First-keystroke invalidation preserves warnings. Source-less original sentences still present remain flagged. Original missing notes remain visible and block until the user corrects the text and explicitly confirms resolution; unchanged/whitespace-only text cannot resolve them. The generation trace stays intact, and edited prose has no inherited sentence mappings. The actual-popup test types Space/Backspace, checks the still-disabled approval button, makes a supported correction, explicitly resolves the note, then introduces a new unsupported claim and verifies blocking. These heuristics are not semantic entailment. |
| AB-2 P2 | Confirmed. Cross-application save replaced the original record. Cross-application reuse now forks a new ID with `derivedFrom` ID/revision while retaining the original factual record, scope and trace. Same-application replacement still uses expected revisions. The library rejects any cross-application replacement, independently of the UI. The three-application browser test preserves A's exact record/revision and pending preview while B and C save different scopes. The popup initializes scope from the reused record and resets it for a fresh draft. |
| C-1 P2 | Confirmed. Answer preview revived consumed native actions and erased outcomes. Preview now refuses any non-preview plan and requires a scan. Answer invalidation never alters finished/interrupted plans. Browser regressions preserve the entire durable plan through finished native fill, interrupted-marker injection, answer preview and edit; a fresh scan plus renewed saved-answer review can fill only the still-empty textarea. No overwrite was reproduced in the original candidate. |
| C-2 P3 | Confirmed. CRLF/CR in generated/edited text now become LF before approval, preserving other whitespace. Unit and actual-extension tests verify the complete approved LF text and six successful readbacks. |
| C-3 P3 | Confirmed. Writer observers distinguish a refusal from an attempted mutation. The immediate and delayed readback establish `verified`; unsuccessful readback reports an attempted but unverified write. Missing/invalid/duplicate reports are unknown; injection failure is unreachable/unknown. The popup shows a durable interrupted notice and never labels an unknown write as untouched. Browser tests cover refused existing value, delayed rewrite, unreachable document boundary and interrupted state. The radio observer indicates a click attempt; a cancelled click is not claimed successful. |
| C-4 / AB-3 P3 | Same root cause, confirmed. Page scan, signature and live job checks now use the same sanitizer as the trusted planner. Soft hyphens and other invisible formatting no longer create false changed-page refusals. Placeholder safety cues and option values that would be cut are excluded from automatic planning instead of signing a truncated value. Unit cases cover soft hyphen, ZWSP, LRM, word joiner and BOM in headings/questions plus meaningful job changes; browser cases cover soft-hyphen email, late safety cues and post-scan signature mutations. |
| AB-4 P3 | Confirmed. Numeric support now compares complete tokens instead of substrings; common number words are included. The unit repro rejects 2, 1, 20 and three from facts containing 12 and 2021. Matching tokens still do not prove that their meaning or attribution is correct. |
| AB-5 P3 | Confirmed. The previous triage's no-rewrite statement was wrong for raw values normalized to empty. Synthetic loading now refuses any existing raw profile or fact storage. Browser regressions preserve overlong, malformed, unexpected and empty-object profiles and pre-existing malformed facts. No reset/replacement UI was added. |
| AB-6 P3 | Confirmed. State returns facts and valid unique saved records with a separate library error. Writes/reuse remain blocked until explicit recovery. The UI can inspect/export the raw library and recover only after confirmation. Recovery compares the inspected snapshot token, stores the entire original envelope in quarantine, and preserves it through later save/delete operations. Unknown versions recover no guessed records. Browser and unit tests cover valid-plus-invalid records, retained raw backup, unknown schema, confirmation and stale inspection. |
| D-1 P3 | Confirmed. Playwright JSON metadata includes SHA, tree, branch and dirty status. `JAA_REQUIRE_CLEAN=1` refuses a dirty release checkout; development runs are truthfully marked dirty. The manual real-response runner also requires a clean commit and records SHA. The exporter continues to require a clean commit; unknown GitHub accessibility is now `null`, not a false negative asserted without a probe. Exact final logs/results/export live beside the SHA in the external release handoff. |
| D-2 P3 | Credits and portable-path issues fixed. Credits now explicitly disclose Claude-assisted foundation work, Codex implementation and exact-candidate Grok review scope; Git history confirms a Claude-authored foundation commit. Plan links no longer expose owner machine paths and link to portable disclosures. **License choice remains an owner decision**, not a code defect we can resolve by inventing a grant. No license or repository visibility change is made. |
| HY-5 / old H2 outcome IDs | No page exploit reproduced: the fill script is extension-owned isolated-world code and returns action refs. Defense-in-depth added: bind reports to expected document and planned refs; require one consistent report; duplicates/unknown/missing results never count as verified. A unit regression pins this. |

## Other observations and bounded scope

- HY-1 scope stickiness is addressed by initializing from the current answer and resetting for fresh contexts.
- HY-2 changing selected facts/job context discards the unsaved current draft by design: its request/approval no longer describes the selection. Saved records remain intact. An unsaved-draft history/confirmation flow is deferred; no audit evidence establishes a saved-record loss on this path.
- HY-3 raw synthetic fact replacement is prevented by AB-5. Current approval still compares the complete source text, not just revision IDs; state/reuse now recompute warnings too.
- HY-4 a storage error after a library write can still report failure despite persisted data. It cannot claim success without acknowledgement or silently fill. Reopening reads the durable record. Multi-store transactions remain a platform limitation, not a demonstrated wrong-write defect.
- Safety H-a (a radio appended after scan) and H-b (worker interruption between command injection and fill injection) were hypotheses. No unsafe write was reproduced. A durable execution marker, per-scan signature, emptiness/visibility checks and no automatic retry remain. Existing radio lists/descriptors preserve chosen index binding; fresh scans create a new scan identity.
- Old H7 résumé metadata is in a dormant module. This release has no attachment action; extending the résumé feature is outside this audit cycle.
- The runner now supplies `node_modules/.bin` on PATH when invoked directly, addressing both reviewers' optional tooling observation.

## Verification and evidence boundaries

Permanent regressions are in `tests/e2e/audit-cycle-1.spec.ts` and the `hackathon-*` unit files. Before fixing the implementation, all five C-side browser regressions and all four AB-side browser regressions failed on the audited code; the two new contract regressions failed too. Some setup/assertion expectations were subsequently corrected (the demo has three facts, and UI tests wait for a completed async review action). This is not a claim that every old test covered popup keystrokes.

For the final committed candidate run:

```sh
npm ci
JAA_REQUIRE_CLEAN=1 npm run check
npm run build
node scripts/export-candidate.mjs /path/outside/repository/candidate-artifacts
JAA_SMOKE_DIR=/path/outside/repository/candidate-artifacts/smoke node scripts/manual-ai-smoke.mjs
```

The last command waits for a genuine response to its fresh request; no replay, provider purchase or automatic paid API call is used. The exact SHA and test counts belong in the external `RELEASE-HANDOFF.md`, JSON metadata and console logs generated after committing, rather than a self-referential source commit. Historical smoke files remain explicitly historical.

Still require separate evidence: a fresh free-account judge route, production toolbar `activeTab` rehearsal, manual unpacked/branded Chrome setup, in-platform video and submission. An actual model smoke through a current authorized chat can establish the manual response path, but cannot certify free-account availability or independent human review. The production manifest and automated Chromium path are checked separately. No user submission is performed. Token warnings, a 100 ms readback, fixture tests and Grok reviews do not guarantee universal correctness.
