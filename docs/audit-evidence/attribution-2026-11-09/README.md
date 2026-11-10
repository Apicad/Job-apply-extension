# Attribution-only development history correction

New product source: **`ebe01d6e01a0b441e7d446515a357c4277a895d1`** — [exact source](https://github.com/Apicad/Job-apply-extension/tree/ebe01d6e01a0b441e7d446515a357c4277a895d1).
Previous audited source: `cb0a1298ba54cfeef100541e42c1c1ba535b3e00`.
Both have tree **`3e53623c142a22c97f64973c8877bc0e4faac819`**. No product code or documentation changed in this replacement.

The owner confirmed both accounts belong to them and authorized correction of their development commits. Thirteen commits reachable from our ten local codex branches, but not from remote main `a7b01ff0d74fa82dd5ca851ff87cbd52a05e97c9`, were rewritten. Matching author and committer fields independently changed from liam / abythenice to Abdiel Picado / Apicad. Every source tree, message byte, author date, committer date, timezone, parent relationship and other header was preserved. Commits reachable from main and other contributors were not rewritten.

[mapping.json](mapping.json) maps every old commit and branch tip to its rewritten counterpart and records the tree invariants. The old evidence tip `6bdcac47448b0645b51340b7f5694b7e45f32ece` maps to `f4adc844cd4e880f60067f79b1fdc48c7188e986`, with identical tree. This new mapping/evidence directory is a separate additive documentation commit on top of that rewritten evidence tip; it is not part of the product SHA.

All ten local branch refs were updated with one compare-and-swap transaction after clean-worktree checks. Local main, the separate résumé branch and all previously modified/untracked shared-worktree files were verified unchanged. A complete recoverable Git bundle and full local before-state are retained outside the repository; mapping.json records the bundle checksum. Restore old refs from that bundle into a separate recovery repository, not over active development refs.

## Checks rerun at the replacement source SHA

The independent validation clone was checked out clean and detached at `ebe01d6e01a0b441e7d446515a357c4277a895d1`. `JAA_REQUIRE_CLEAN=1 npm run check` passed typechecking, 4,154 unit tests in 19 files and 27 actual-extension Chromium tests, with zero failures, skips or flaky results. `npm run build` passed; production output remains 448.74 kB. The existing dependency installation was reused because all files and the lockfile are unchanged. The new source export was checked byte-for-byte against all 136 committed files and its archive comment matches the new SHA. See verification.json and sanitized check.txt/build.txt.

Historical [cycle-2 evidence](../cycle-2/) remains unchanged, including its old source SHA, timestamps and actual Codex response. That AI smoke was executed at the old source SHA and has not been rerun or relabeled. The mapping proves the current source content is identical. The evidence commit is not a substitute source checkout.

The Groks' in-progress review of the old source remains a review of those identical files; they should verify this mapping before citing the replacement SHA. A newly reported Safety N7 save-before-fill issue is queued for separate cycle-3 reproduction/fix, not hidden in this attribution-only replacement. Kevin's full cycle-3 report remains pending. Independent audit conclusions and manual judge/Chrome/license gates are not upgraded by changing attribution. AI connectors remain a separate next phase.
