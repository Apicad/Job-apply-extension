# Preliminary foundation audit triage

External reports from Kevin and Safety reviewed **1f22cb3f76189001d34703db9a6e964fad21518d**, not this candidate. No external candidate verdict exists. Report summaries were delivered by the owner's coordination chat; relevant Kevin F1 details were read from the supplied full report. Do not transfer an old PASS or INCOMPLETE to the final SHA. The final exact-SHA handoff is exported separately after the last commit and fresh-checkout tests.

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
| Overlong stored profile strings | Existing normalizer fails closed. This release does not round-trip or rewrite existing profiles; synthetic loader refuses nonempty profiles. Rich profile editor remains another stream. |
| Résumé filename/size hypotheses | Existing résumé tests retained. This slice never attaches or rewrites files; no reachable auto-attachment path. Do not claim file-upload verification. |
| Private history metadata / public readiness | No history rewrite, push or visibility change. Export uses `git archive` of the exact source tree, without `.git`, browser profiles or local research dumps. Repository history/metadata and license choice still need owner review before publishing. |

Local self-review is not an independent Grok audit. For any subsequent findings, reproduce on the exported final SHA, fix in an owned branch and create a new tested candidate/export.
