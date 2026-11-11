# Reusable profile answers and résumé preview

The home profile is the source of reviewed applicant information. A switch controls whether a section is reused on applications; a separate switch controls whether it appears on the résumé. Turning a switch off retains the saved information. This release formats existing wording without AI generation or credits.

| Typical question | Saved source | Current behavior |
| --- | --- | --- |
| Name, email, phone, profile links | Contact and links | Fill supported empty fields; preserve existing values. |
| Current city, state, country, address | Location | Fill supported controls when location autofill is on. Exact custom location matches only. |
| Country of citizenship | Explicit citizenship country | Simple text or native choice; never copied from residence. |
| Nationality | Explicit nationality | Simple text or exact native choice; never copied from name, ethnicity or citizenship country. |
| Are you a U.S. citizen? | Explicit yes/no answer | Only the narrow U.S. question and bare yes/no choices. Blank stays unanswered. |
| Authorized to work? Sponsorship required? | Separate explicit answers | Existing country-scoped rules; citizenship does not supply either answer. |
| School, major, degree, graduation | Optional education | Fill only saved details when education autofill is on. No earned-degree or date inference. |
| Current employer and title | Explicit current company/title | Fill when enabled; a past résumé role does not establish current employment. |
| Complete work history | All saved experience notes | Included in the preview and available for reviewed AI drafts. Repeating employer/date rows need reviewed structured records and an ATS adapter. |
| Projects and skills | Saved notes and résumé skills | Include selected notes and the verbatim skills line in local exports. No invented keywords or achievements. |
| Location preferences, relocation, shifts, salary | Not yet represented | Manual; current location does not establish preferences or availability. |
| Export/sanctions declarations, certifications, consent | Question-specific review | Manual, including checkbox groups. No blanket answer from a citizenship flag. |
| Voluntary demographics | Existing optional saved answers | Existing conservative matching; never included in the generated résumé. |

The live preview uses the current editable draft and labels unsaved changes. Save profile persists both the facts and résumé choices with stale-editor protection. All notes are included by default; the user can assign Experience or Projects and hide individual notes. Word export and print/PDF are local. The uploaded application attachment is unchanged until explicitly replaced.

No universal “fill every field” claim is made: unknown facts, compound attestations and unsupported controls remain visible for review. No application submission, credit purchase, new LinkedIn integration or external publication is part of this change.


## November 11 follow-up: AI-created résumé and cover-letter previews

The owner explicitly requested AI to pull the saved information and create documents for a job posting plus career direction, then show a preview. This supersedes earlier exclusions on résumé tailoring and cover letters for this bounded home workflow. The home offers one Create résumé & cover letter action, Base/Tailored/Cover-letter preview tabs, editable generated wording, source/missing-information review, and local Word/PDF export. The base profile, factual notes and uploaded application résumé are never overwritten.

Use the existing signed-in Codex/Claude helper with no app credits or paid fallback. Its new materials capability is checked before evidence transfer. AI receives included experience/project facts, optional education/skills, and target text. Contact and eligibility profile fields stay local; source identity uses SHA-256. Employer/title/date/link headers remain immutable local data. Generated summary, bullets and letter paragraphs reference saved evidence; entry bullets cannot borrow another employer's fact. Grounding checks are bounded review aids, not semantic proof.

Store generated drafts separately with source/target hashes, exact-content review fingerprints and optimistic revisions. Edits invalidate review. Source or target changes require regeneration before download. Expired inference requests must not erase saved documents. Cancellation discards late replies; storage acknowledgement briefly locks the editor so it cannot overwrite newer text. Keep profile import and basic Autofill usable when the helper is unavailable or older.

Verification includes strict response/citation handling, preserved headers and attachments, stale edits, helper capability negotiation, cancellation, print/Word layout and an actual synthetic Codex request with no tools. Recorded response replay in browser tests is explicitly separate from the real native smoke. Do not send personal data for development smoke tests, install/upgrade the live helper, submit applications, or publish this candidate as part of this implementation step.


### Preferred first name

Profile home also stores an optional preferred first name, blank by default. Résumé and cover-letter names/signatures use it when supplied and otherwise use the regular first name. Autofill uses it only for explicit preferred first/given-name text questions; ordinary and legal first/full names keep the original identity. Ambiguous preferred-name questions remain manual. This value stays local during document generation, and changing it makes existing tailored documents stale until regenerated.
