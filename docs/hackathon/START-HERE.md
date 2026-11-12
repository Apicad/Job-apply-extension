# Install and try Job Apply Assistant

Use desktop Google Chrome. Basic autofill, local résumé import, general résumé preview and export do not need an AI account. AI-created résumés and cover letters require your own supported signed-in CLI and its available account allowance. No app credits or paid fallback are used.

## Install the prebuilt bundle

1. Extract the complete `job-apply-assistant-0.6.4.zip` into a permanent folder. Keep it there while the extension is installed. Do not choose the ZIP itself.
2. Open `chrome://extensions` in Chrome. Turn on **Developer mode**, choose **Load unpacked**, and select the bundle's **extension** folder (the one containing `manifest.json`).
3. Pin **Job Apply Assistant** from Chrome's puzzle-piece menu. Open its Details → Extension options to reach **Profile home**.
4. Upload your résumé, review the extracted fields, add your experience/project notes, and **Save profile**. Nothing from the developer's account is bundled. Education and sensitive eligibility answers are optional; leave unknown answers blank.
5. Open an application page, click the extension's toolbar icon, then **Autofill**. The toolbar click grants access to that tab. Review the sidebar and the actual form. The extension never submits.

For practice, create a separate Chrome profile and use the included fictional résumé. An employer may receive data as soon as fields or uploads change, even before submission. The local practice pages below do not contact employers.

## Run the safe three-platform practice

Install Node.js 24 LTS or newer from [nodejs.org](https://nodejs.org/). In Terminal (macOS/Linux) or PowerShell (Windows), change into the extracted `job-apply-assistant` folder, then run:

```sh
node scripts/demo-server.mjs
```

Open the printed `http://127.0.0.1:5179/` URL in Chrome. It walks you through a fictional profile, Greenhouse/Lever/Ashby-shaped applications, and a document-generation prompt. Keep the terminal open. Press Ctrl+C when finished. If the port is busy, use `node scripts/demo-server.mjs 0` and open its printed URL.

No `npm install`, developer account, API key or repository checkout is needed for the prebuilt bundle. The practice server only reads its fixed demo files, binds to this computer, and refuses submissions. See **COMPATIBILITY.md** for exactly what the tests cover.

## Connect your own AI (macOS or Linux Google Chrome)

The current native helper supports macOS/Linux. Windows users can use basic autofill and the general résumé preview/export, but **AI-generated documents are not supported on Windows in this release**. Windows execution has not been validated on a Windows device.

1. Install and sign in to the Codex CLI using its official installation instructions. The Codex desktop app alone is not assumed to expose a usable CLI. Confirm `codex --version` and `codex login status` work in your terminal. Use a supported ChatGPT account; an API-key login is not the intended connection. Claude Code is an alternative only when Codex is absent; its organization may block inference.
2. Copy the extension ID from `chrome://extensions` (32 letters). In the extracted bundle folder run:

```sh
node scripts/install-ai-host.mjs --extension-id YOUR_EXTENSION_ID
```

3. Open the application sidebar → **AI connection** → **Check connection**. The installer pins one provider and only this extension ID. Re-run it after upgrading the helper or changing the extension folder/ID.
4. In **Profile home**, enter the position you want. Company, posting and career direction are optional for a general résumé. Add a posting later to tailor it. Select the saved facts to include. Click **Create résumé & cover letter**. Selected facts and target text go through your CLI to your AI account.
5. In the General résumé preview, expand **Choose what to include** to edit a professional summary, select Professional or Classic style, choose a one-page or multi-page preference, and include/exclude sections and notes. Save profile before generating. Longer documents are never silently clipped.
6. Wait for a new result, then open **Tailored résumé** and **Cover letter**. Review/edit the text and source warnings. Check **I reviewed both documents and checked the claims** to enable Word export or Print / save PDF. Use US Letter, disable browser headers/footers, and check page count. Generated exports do not automatically replace the uploaded résumé.

A successful connection check proves CLI/account detection, not successful inference. The final acceptance check is a new generation that appears in both preview tabs. Keep any generation error visible; do not describe an old draft as a new result. Account limits still apply.

## Rebuild and reproduce

The bundle includes `source.zip` with the exact committed application source. Tests, research notes, reports and planning documents are excluded at the owner’s request. `RELEASE.json` identifies its SHA; `SHA256SUMS` identifies every bundled file. Extract `source.zip`, enter `source`, and run with Node 24+:

```sh
npm ci
npm run compile
npm run build
```

On Linux, Chromium may also need system libraries: `npx playwright install --with-deps chromium`. Load `.output/chrome-mv3` in Chrome. Never distribute `.output/chrome-mv3-e2e`, which has localhost permissions for automation. Automated tests use fresh synthetic profiles and do not submit applications. They do not prove the production toolbar's `activeTab` grant; check that manually with the practice pages.

The automated test suite is retained only in the owner’s local checkout. A fresh GitHub clone or source ZIP can build the extension but cannot run those tests. Practice pages require the local fixtures; check `practiceFixturesIncluded` in `RELEASE.json` before following the practice steps. `npm run check` and `npm run test:e2e` require the private local test directory.

To package from a Git checkout: commit the reviewed source, run the checks, then `npm run package:release -- /absolute/path/to/new-output-folder`. The command builds production assets and refuses a dirty checkout or existing destination. The source ZIP can be rebuilt without Git; the provenance-based tests and release packager require a Git checkout.

## If something does not work

- **Cannot access the page:** open the actual application page and click the toolbar icon again. Chrome settings pages and cross-origin embedded forms are unsupported; open the employer's direct hosted application when available.
- **No application found / zero fields:** use the form itself, not only a job-description page. Later steps and unusual widgets may require manual completion. Never interpret a zero count as a completed application.
- **Some fields remain:** inspect Needs your attention and the full form. Repeated work history, consent, unsupported dropdowns and later steps are manual. Existing values are preserved.
- **Native host not found:** confirm the extension ID and re-run the installer from the full bundle, then reload the extension. The helper is for Google Chrome, not Edge/Brave/Firefox.
- **AI failed or timed out:** verify CLI sign-in/account limits, then explicitly retry. No automatic paid fallback occurs. Basic autofill remains available.
- **Import seems incomplete:** scanned PDFs are not OCR'd. Enter missing details and save. Files must be at most 4 MB.
- **Moving to another device:** save original documents separately and set up a new profile there. This release has no complete profile backup/restore or cloud sync. Do not remove an existing Chrome profile until its information is retained.

## Five-minute demo

Show the saved fictional profile → demonstrate a new AI answer on the linked generic practice page → run Autofill on each practice format → demonstrate preserved edits and clearly flagged manual fields → create fresh AI résumé/cover-letter drafts → switch previews and review before export. Leave every application unsubmitted. When presenting, distinguish local format tests from live employer testing.
