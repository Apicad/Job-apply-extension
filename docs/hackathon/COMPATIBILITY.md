# Three-platform hackathon scope

This release targets **partial, conservative assistance**, not universal application completion. Tests execute against local synthetic forms shaped like three platforms. They are not successful live-employer application submissions or certification by those providers. Employers can customize forms and platforms can change markup.

| Format | Demonstrated scope to verify | Manual / excluded |
| --- | --- | --- |
| Greenhouse | Contact fields, formatted phone, résumé upload, exact supported country/location and school/degree choices; ambiguous choices stay blank | Consent, checkbox groups, unmatched choices, repeated records, additional attachments |
| Lever | Full name, email/phone, recognized links and résumé upload; existing answers preserved | Location typeahead, unsupported questions, signatures and consent |
| Ashby | Recognized fields in a layout without a form element, contact details and résumé upload | Custom location controls, consent and unsupported questions |

Run `npm run test:platforms` for the focused suite. Run `npm run check` for all regressions, including document preview/edit/review/export checks and native protocol tests. Standard AI tests use deterministic boundary responses. They must be supplemented by a **fresh real signed-in CLI generation** for the candidate, with both documents rendered in preview. Connection status alone does not pass that check.

Record exact SHA, runtime, test totals, live AI provenance, screenshots, and any untested conditions in the release evidence beside the ZIP. A dirty-tree run is development evidence, not final exact-SHA verification.

For the opt-in real AI check after `npm run build:e2e`, set `JAA_CODEX_BIN` to the absolute path of your signed-in Codex executable and run `node scripts/live-materials-smoke.mjs /absolute/path/to/new-evidence-folder` from a clean checkout. This uses fictional applicant facts, the real native framing/host/CLI and new inference, then checks both document previews, the review gate, and a fresh sidebar answer drafted from those saved facts. Its browser port is a test bridge and its browser build has localhost grants, so it does **not** verify OS native-host registration or production toolbar permissions. A manual installed-Chrome rehearsal must verify those separately. The normal test suite never spends account inference allowance.

The separate generic practice page demonstrates the two currently supported AI question wordings: “Describe a relevant project” and “Tell us about a project you built.” Other free-text questions remain manual. Do not present this bounded demo as arbitrary-question answering. Saved notes provide reusable evidence; this version does not yet automatically rank a large project database or choose which résumé sections to omit.

Recognition means identifying supported visible application fields when the user activates Autofill. There is no passive monitoring or automatic navigation. Job listings without a form, inaccessible embeds, unsupported later steps and account-gated flows are not silently treated as completed applications. The user must inspect the entire form even when the sidebar has no outstanding items.

Independent-device limits: Chrome is required; the AI helper currently supports macOS/Linux only. A fresh isolated browser profile on the developer's machine is useful evidence but is not a test on a second physical machine. Record those separately. Workday, LinkedIn integration, full repeated employment, a role-based résumé library and complete profile backup/restore are outside this hackathon release.
