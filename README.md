# Job Apply Assistant

A Chrome extension project for filling job application forms using information
the user saves in the extension. The goal is to make repetitive applications
easier while keeping the user in control: review the preview, fill the form,
then submit it yourself.

> **Development status:** This project is under active development. The
> repository contains the form-recognition and fill-engine building blocks,
> but the complete popup and profile-editing workflow is not yet wired into
> the extension.

## Safety and privacy goals

- The extension never submits an application. You review and submit it.
- It should only fill visible, unanswered fields, and should leave uncertain
  fields for you to handle.
- Profile and résumé data are intended to stay in browser storage and are not
  sent to a service.
- A fill should be previewed before any form fields are changed.

## Development setup

You need Node.js 22.12 or newer. The `.nvmrc` file specifies the project's
preferred Node version.

```sh
npm ci
npm run dev
```

WXT starts the extension's development build. Since the user-facing workflow
is still in progress, the development build may not yet provide a complete
application experience.

To create a production build, run:

```sh
npm run build
```

The unpacked extension is generated in `.output/chrome-mv3`. Load that folder
through `chrome://extensions` with Developer mode enabled.

## Checks

```sh
npm run compile   # TypeScript
npm test          # Unit tests
npm run test:e2e  # Build the test variant and run Playwright tests
```

Run all checks with `npm run check`.

## Project layout

- `entrypoints/` — WXT extension entrypoints.
- `lib/` — profile, field classification, form handling, and related logic.
- `tests/unit/` — Vitest unit tests.
- `tests/e2e/` and `tests/fixtures/` — Playwright tests and local test pages.
- `page-blueprint/` — a separate form-inspection tool.
- `docs/superpowers/` — design notes and plans.

## License

No license has been specified yet.
