# Audit cycle 4: persisted answer target consistency

Both full cycle-4 reports audited source `a59c71bca9860e2e2938feedc9ad7e6afc545d21`, tree `722bb583514baa6c92877e1ba6c3b71a335e6292`, with separate evidence `ea85e53e45fa5ac59c5cde3a45107219e484e9ad`. Kevin reported no actionable A+B defects. Safety reported one P3 consistency issue, C4-1. Both independently reproduced 4,154 unit tests, 37 browser tests and byte-identical production build/export results. Those observations concern the audited source, not a certification of this later fix.

## C4-1 disposition

Confirmed with privileged extension-context writes to `storage.session`. A saved Q1 approval could be paired with a session pointing at Q2, or an application-A approval with a current application-B plan, while retaining the original saved context. The prior guards compared the saved approval to the persisted session context but did not derive that context again from the target row.

This is a defense-in-depth consistency repair. Neither auditor nor builder demonstrated page-content or normal UI/message reachability. Session storage is restricted to trusted contexts, and ordinary request/rescan flows set or invalidate the coupled fields. Do not describe this reproduction as a page exploit or broaden it into a general trusted-storage security redesign.

The request path now shares `contextForRow` with the preview/execution checks. It derives the application digest from the current plan URL and row job snapshot, and the question digest from the target descriptor/form/length signature. Before answer preview mutates the plan, and before execution marks it executing or writes any native/textarea value, those derived values and the question text must agree with both the session and saved approved context. Existing exact saved identity/revision/approval/fact checks remain. Reviewed job text stays a user-reviewed input; it is not silently replaced by page requirements. Existing live-page checks still guard navigation and descriptor/job changes.

Four regression cases first reproduced acceptance against the audited implementation: Q1→Q2 and application A→B, each injected before preview or after an approved preview and before fill. After the fix they must be refused with the library unchanged, both textareas and native fields empty, no outcomes and no submission. Three positive browser controls exercise same-question, cross-question and cross-application explicit reuse → review → approve → save → preview → fill, retaining original record and scope semantics. Cross-application reuse explicitly uses factual scope; an application-scoped record is not promoted automatically.

## Scope and verification

Implementation changes are confined to `lib/hackathon/answers.ts`; no schema, provider, permissions, page writer, UI or dependency change is needed. The new browser cases use the actual built extension/worker and real storage. Only the negative cases perform privileged test injection; their inputs are not claimed obtainable from a page.

Run the affected regression, full pre-commit check, then a fresh-clone clean exact-SHA check/build/export and a new synthetic response smoke. Publish passing source on `codex/release/candidate` and sanitized evidence separately on `codex/audit/evidence-cycle-4`, with both full immutable SHA links. Verify Apicad author/committer before commits. Keep the source stable for focused independent verification of C4-1 and relevant positive reuse paths.

Residual limits: this consistency check is not protection against a fully privileged extension context rewriting all trusted state. Semantic support still requires human review; the 100 ms readback window, free judge-account access, production toolbar/manual unpacked/branded Chrome rehearsal, owner license choice and recording/submission remain as previously documented. No main merge, visibility change, paid model API or live application submission. Multi-provider/Codex connections remain queued separately.
