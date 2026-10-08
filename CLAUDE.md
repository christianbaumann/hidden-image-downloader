# Project: Hidden Image Downloader

A Chrome/Firefox extension that downloads images which websites hide behind a transparent GIF (or similar overlay), so the browser's own "Save image" grabs the overlay instead of the image.

## Stack
- **Language:** Vanilla JavaScript (no frameworks)
- **Targets:** Chrome and Firefox, Manifest V3

## Conventions
- No build step, no transpilation. Plain `.js` files loaded directly by the extension.
- Runtime dependencies are vendored in `vendor/` — not via npm.
- Dev tooling (ESLint, Playwright, …) lives in `package.json` devDependencies — npm is fine for tools that never ship in the extension.
- Firefox: MV3 needs `browser_specific_settings.gecko` (`id`, `data_collection_permissions`) and `background.scripts` instead of `background.service_worker`. Not handled yet; `web-ext lint` reports it.
- `eslint.config.js` lints root `*.js` (extension code) with browser + `chrome` globals. Add per-file globals there when scripts share functions.
- `ref/` and `sandbox/` hold real pages and downloads. They are gitignored — never commit their content. Commit only sanitised copies as test fixtures.

## Standing Orders
- Update this file when learning something new about the project.
- Update README.md when relevant changes happen.
- Commit after every completed vertical slice (once checks pass).
- Before every commit, review all uncommitted files (`git status`). For each file, decide: commit it (if intentional) or delete it (if leftover/accidental). Do not leave unexplained uncommitted files behind.
- Before committing, check whether any new files or directories should be added to `.gitignore`.

## Programming Rules
- **Agile delivery:** minimal vertical slices, fully tested and working end-to-end before expanding.
- **YAGNI / KISS:** simplest solution that works.
- **Boy scout rule:** fix pre-existing issues (lint errors, broken behavior) even if not caused by current changes.
- No magic numbers — use named constants.
- No refactoring-context comments.

## Changes
Unless following the boy scout rule: only do modifications requested.

## Testing
- Every change needs appropriate test coverage — write tests as soon as the functionality is coded, not at the end.
- All tests must pass before committing.
- Always set reasonable timeouts on operations that might hang.
- Follow the **test automation pyramid** (Martin Fowler): test at the lowest layer that meaningfully covers the functionality — do not duplicate coverage at a higher layer.
  - **Unit tests** (Node.js, no browser): pure functions. Run with `npm test`.
  - **Integration tests** (Node.js, external calls mocked): only for behavior that cannot be verified at unit level. Run with `npm test`.
  - **E2E tests** (Playwright, Chrome with extension loaded): popup UI, extension lifecycle, and flows that require a real browser context. Run with `npm run test:e2e`. Uses `headless: false` — Chrome extensions require it; use headless mode for everything else. Apply the **Automation in Testing** pattern: automate setup and result verification; let the human perform only steps that need a real website. Document every remaining manual step and why it cannot be automated.
  - **Visual debugging**: when automated assertions are insufficient to diagnose a failure, take a whole-browser screenshot via macOS `screencapture` (e.g. `screencapture -x /tmp/debug.png`) or via Playwright's `page.screenshot()`, then analyse the image.
- Automate every testing step that can be automated.
- `npm test` runs lint + unit/integration tests. `npm run test:e2e` runs Playwright E2E tests. Both must pass before committing.
- No E2E tests exist yet: `tests/e2e/` and its fixture (extension ID derived from the background service worker) come with the first background script. Until then `npm run test:e2e` fails with "No tests found".
- Playwright's timeout is 60 s: it charges fixture teardown (closing the headed Chrome) against the test budget, so short budgets get flaky.

## Linting
- Use ESLint with a config committed to the repo.
- `npm test` runs lint + unit tests together.
- Fix all lint errors before committing; warnings must not increase.

## Guardrails
- **Pre-commit hook:** `.githooks/pre-commit` runs `npm test`. `npm install` activates it via the `prepare` script (`git config core.hooksPath .githooks`).
- **CI:** `.github/workflows/ci.yml` runs `npm test` on Node 20 and 22 for pushes and PRs to `main`.
- **Dependabot:** weekly npm and GitHub Actions updates; `.github/workflows/automerge.yml` auto-merges them once `npm test` passes.

## Output
Brief but precise, no bloat. Bullet points where appropriate.
