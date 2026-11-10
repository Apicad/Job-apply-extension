# Cycle 2 verification evidence

Tested source: **`cb0a1298ba54cfeef100541e42c1c1ba535b3e00`** (tree `3e53623c142a22c97f64973c8877bc0e4faac819`).

[Exact source](https://github.com/Apicad/Job-apply-extension/tree/cb0a1298ba54cfeef100541e42c1c1ba535b3e00) · [Finding dispositions](https://github.com/Apicad/Job-apply-extension/blob/cb0a1298ba54cfeef100541e42c1c1ba535b3e00/docs/hackathon/AUDIT-CYCLE-2.md)

This directory is published in a separate evidence-only commit based on that source. Its own commit SHA is not the tested product SHA. Use the full source SHA for code review and reproduction; do not substitute main, an earlier candidate, or the moving branch head.

## Executed gates

The clean independent validation clone passed `npm ci`, `JAA_REQUIRE_CLEAN=1 npm run check` (typecheck, 19 unit files / 4,154 tests, 27 actual built-extension Chromium tests with zero failures, skips or flaky results), and `npm run build`. Logs are supplied with local filesystem paths redacted, terminal control codes removed and trailing whitespace trimmed. See verification.json and browser-results.json for actual metadata. The production bundle reports 448.74 kB; permissions are storage, activeTab and scripting, with no host permissions or content scripts.

The source export was compared byte-for-byte against all 136 committed files. SOURCE-FILES-SHA256.json records those files; verification.json records the local git-archive zip checksum. Both authoritative plan documents and the Grok instruction document are in the source commit.

## Fresh model response and actual UI smoke

The runner started from the clean tested source and exported a fresh request from the actual popup. The active Codex session read that prompt and authored the two-sentence JSON response; no provider API was invoked and no previous response was replayed. Both sentences were compared to their selected original synthetic snippets before approval. Model backend identity is not independently attested by these artifacts. This is builder-supplied evidence, not a claim either Grok ran it or that a fresh free account can reproduce the route.

The actual popup validated the response, displayed the original sources, approved and saved the exact answer, reopened it, previewed the writes and filled the synthetic application. The runner recorded six verified writes, exact textarea readback, one saved answer, successful reopen and no submission. The source-review and filled-sample screenshots were visually inspected. Request, response, validated draft, result and both screenshots are in [smoke](smoke/). All applicant and job data are synthetic.

## Reproduction and limitations

Clone the repository and check out `cb0a1298ba54cfeef100541e42c1c1ba535b3e00` detached. Use Node 24, `npm ci`, `npx playwright install chromium`, `JAA_REQUIRE_CLEAN=1 npm run check`, then `npm run build`. To run a new AI smoke, inspect scripts/manual-ai-smoke.mjs, use a new empty external JAA_SMOKE_DIR and supply a real freshly generated response to its request; do not replay these identity-bound artifacts.

Cycle 2 fixes cover original-claim citation constraints after edits, separate answer records for different questions on one application, bounded ordinary “one of / one part of” phrasing, and pre-approval normalization of legacy CRLF answers. Six added browser tests include the native-fill/rescan/saved-answer workflow; see the source disposition document for cross-checks and heuristic limits.

Still unverified or owner-dependent: fresh free-account judge access, production-toolbar activeTab/manual unpacked and branded Chrome rehearsal, owner license choice, and event recording/submission. Semantic support still requires human review. The next independent Grok audit has not yet been run on this source. Multi-provider/Codex connector planning remains a separate next phase.
