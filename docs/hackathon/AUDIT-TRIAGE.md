# Preliminary foundation audit triage

Historical SHAs in this document identify the commits actually used at the time. The owner-authorized attribution correction preserved their trees; use the public [old-to-new commit map](https://github.com/Apicad/Job-apply-extension/blob/0374e354643f723c901c937f785b18077a11522d/docs/audit-evidence/attribution-2026-11-09/mapping.json) to locate their equivalents in the current development history. Historical AI runs have not been relabeled as new executions.

External reports from Kevin and Safety reviewed **1f22cb3f76189001d34703db9a6e964fad21518d**, not this candidate. This paragraph records the earlier foundation review only. Subsequent exact-candidate reports on `5985c2331e357ae57da25fad0eacab0b32db0a2d` and their fixes are documented in [AUDIT-CYCLE-1.md](AUDIT-CYCLE-1.md). Report summaries were delivered by the owner's coordination chat; relevant Kevin F1 details were read from the supplied full report. Do not transfer an old PASS or INCOMPLETE to the final SHA. The final exact-SHA handoff is exported separately after the last commit and fresh-checkout tests.

| Finding | Current evidence and disposition |
| --- | --- |
| Kevin F1, lossy label/legend/option safety tails | Snapshot already has `sanitizeWholeText`: decision-bearing strings remain whole or are excluded. Full describe → guard → native planner regression now covers long certification legend, long eligibility negation and long consent option. No unsafe action planned. Earlier P1 does not reproduce here. |
| Safety F1/F2, rescan handles and relabel/hidden/edited fields | New execution wrapper binds scan UUID, document ID, tab, URL, complete descriptor, options, form, length and job snapshot; recollects and checks visibility/emptiness immediately before each write. Unit and actual-extension mutation tests pass. |
| Safety F3, changed select ordering | Complete options are part of field signature; mutation browser test verifies no select write. Existing option-list bounds fail closed rather than pick on a partial list. |
| Safety F4, nonempty readback and lengths | Executor checks maxlength before writing and exact value after writing and after 100 ms. Delayed unexpected rewrite reports not verified. No mask-normalization success claims. |
| Safety F5, signature cue only in placeholder | Reproduced by inspection of the old classifier's boundary; new native planner and question allowlist reject signature/consent cues in placeholder as well. Added unit regression. Raw/guarded signature mismatch also fails closed for overlong placeholders. |
| Safety F6, shortcut wording | Manifest now says “Open the application review popup”; handler only opens popup. |
| Safety F7, tests bypass extension | New suite launches actual WXT output in isolated persistent Chromium profiles and exercises popup/runtime/storage/injection. Own product modules are not mocked. Quota test injects only external Chrome storage failure. |
| Safety F8, shared fixture port | E2E runner selects a free loopback port; Playwright refuses reuse of another server; iframe ports follow the host page. Each worktree builds its own output. |
| Same-document job changes | New failing browser reproduction demonstrated stale approval; fixed by read-only live revalidation before response/approval/save/preview plus execution job binding. Application identity includes URL and extracted job identity; question identity includes full control fingerprint. |
| Duplicate/negative refs | Worker rejects negative/duplicate scan refs; actions originate only from that scan. Outcome reporting is bound to the injected document and plan; page readback produces one outcome per planned action. |
| Overlong stored profile strings | Correction from cycle 1 AB-5: the old synthetic loader tested the normalized profile, so an overlong-only raw profile could be overwritten. The cycle 1 fix checks raw presence and refuses any existing profile or fact storage. The rich profile editor remains another stream. See AUDIT-CYCLE-1.md. |
| Résumé filename/size hypotheses | Existing résumé tests retained. This slice never attaches or rewrites files; no reachable auto-attachment path. Do not claim file-upload verification. |
| Private history metadata / public readiness | No history rewrite, push or visibility change. Export uses `git archive` of the exact source tree, without `.git`, browser profiles or local research dumps. Repository history/metadata and license choice still need owner review before publishing. |

Local self-review is not an independent Grok audit. For any subsequent findings, reproduce on the exported final SHA, fix in an owned branch and create a new tested candidate/export.

Final concurrency self-review: stale fact editors and stale answer/library editors could replace a newer revision. Added explicit expected revisions at UI/worker/library boundaries. Regressions cover stale library replacement, stale same-tab answer editing and stale fact editing. Targeted tests and all 12 extension browser cases pass. The final export includes this fix and requires its own external review.

Cycle 2 residuals on `24871723c869f5d5d9207a125e93604e96f327d0` are tracked in [AUDIT-CYCLE-2.md](AUDIT-CYCLE-2.md). The earlier verdicts and counts above are historical, not certification of later SHAs.

Cycle 3 findings on `cb0a1298ba54cfeef100541e42c1c1ba535b3e00` (attribution-corrected, identical-tree source `ebe01d6e01a0b441e7d446515a357c4277a895d1`) are tracked in [AUDIT-CYCLE-3.md](AUDIT-CYCLE-3.md): N7 explicit save, N8 reuse origin, and clearer N1b uncertainty. Safety withdrew O4 after verifying the existing rescan guard. Code fixes are separate from the attribution-only history correction.
