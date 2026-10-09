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
- Extension code is ES modules: `background.js` is a module service worker importing `lib/*.js`. `eslint.config.js` lints root `*.js` and `lib/**/*.js` as modules with browser + `chrome` globals.
- Chrome ignores the `filename` passed to `chrome.downloads.download()` while any other extension listens to `downloads.onDeterminingFilename` (e.g. MarkSnip, Video DownloadHelper). `background.js` therefore suggests its own filename in that event, only for downloads it started.
- Functions injected via `chrome.scripting.executeScript({ func })` are serialised: keep them self-contained (no imports, no closures). Put parsing into pure `lib/` functions.
- Lightbox `.webp` images: `background.js` probes the `.jpg` sibling with `HEAD` (5 s timeout) and falls back to the `.webp`. In production the probe goes to a host-permitted origin; in E2E it goes to `127.0.0.1`, which has no host permission, so the fixture server must send credentialed CORS headers (`Access-Control-Allow-Origin: <Origin>`, `Access-Control-Allow-Credentials: true`).
- Profile ZIP: `background.js` opens `offscreen.html` (reason `BLOBS`); `offscreen.js` fetches the photos, zips them with `lib/zip.js` and answers with a blob URL. The service worker downloads that URL via `chrome.downloads` (filename enforced in `onDeterminingFilename`) and closes the document once every ZIP download is `complete` or `interrupted`, since the blob URL dies with the document. Resuming an interrupted ZIP download therefore fails. Open and close calls run through one promise queue (`offscreenQueue`), so double clicks and a close racing a new job can't collide.
- Click dispatch is URL-based, in this order: `clubMailConversationIds(tab.url)` matches `/clubmail/conversation/conversation-wrapper-personal-<a>-<b>/` and takes the ClubMail-only path; `profileUserId(tab.url)` matches profile, `/profile/fotos/…` and `/profile/fotoalbum/…` URLs and takes the album path even with a lightbox open; every other URL takes the lightbox path.
- ClubMail-only path: `fetchClubMailImages([a, b])` alone (via `extractAllWithProgress`, API phase 0 → 10 %), then `toClubMailZipRequest(raw, date)` → `<Partner>_ClubMail_<timestamp>.zip` with only the `ClubMail/` folder. The partner name comes from the first message of `raw.partnerId`. A failure throws `ClubMailApiError` (red badge "ClubMail unavailable"), no messages `NothingToDownloadError`. A conversation without attachments has `entries: []`; `buildZip` then zips the reports alone (it returns no blob only when entries exist but none loaded, or when there are neither entries nor reports).
- Album path: `fetchProfileAlbums(userId)` is injected with `executeScript({ func, args: [userId] })` and makes all API calls inside the tab, with the user's session. The service worker makes none. Steps: `GET /webauth/access_token` (`credentials: 'include'`) → `content.access_token`; then two POSTs to `https://apiv2.joyclub.com/graph/` with `Bearer` token: `getProfileAlbumList` (main album ids, regular albums, restricted ones with `imageCount` only) and `getProfileAlbumImageSources` (`sourceListJson` per id; `largestJpegUrl` picks the widest jpeg). It returns `{ failed: true }` instead of throwing; `toAlbumZipRequest` maps that to `AlbumApiError`.
- Photo fetches in `buildZip` (`lib/zip.js`): `fetchBytes` retries network errors, timeouts, HTTP 429 and 5xx twice (after 1 s, 2 s); other 4xx fail at once and go to `missing.txt`. `buildZip` takes an injectable `delay`, so unit tests pass a no-op instead of waiting.
- ZIP progress: `background.js` gives each ZIP job a `jobId`, sends it with `build-zip` and maps it to the tab in `zipJobTabs` until the build answers. `offscreen.js` sends `{ target: 'background', action: 'zip-progress', jobId, done, total }` from `buildZip`'s `onProgress`, throttled to one per whole percent (`throttleProgress` in `lib/progress.js`); progress for an unknown `jobId` is dropped. The API phase (0–10 %, resolved fetchers / fetcher count) is set by the service worker itself. The `onMessage` listener stays sync, since a returned promise would count as an async answer.
- E2E reads the badge sequence by wrapping `chrome.action.setBadgeText` inside the service worker (`recordBadgeTexts`); the last progress message may legitimately arrive after the build answer and be dropped, so assert containment, not the full sequence.
- JSZip is vendored as `vendor/jszip.min.js`, loaded by `offscreen.html` as a classic script (global `JSZip`). `tests/unit/vendor-jszip.test.js` pins it byte for byte to the npm devDependency.
- ClubMail path: `handleActionClick` injects `fetchClubMailImages([userId])` (`lib/clubmail.js`) in parallel with `fetchProfileAlbums` (`extractAllWithProgress`, API phase 0 → 5 → 10 %). It takes the user ids from the URL (one from a profile, two from a conversation) and drops the own id; one partner id left → `{ origin, partnerId, messages }`, none (own profile) → `{ origin, messages: [] }` without a request, two (not the user's conversation) → `{ failed: true }`. It reads `body[data-session-user-id]` and `body[data-cache-killer]` (missing `cache_killer` → 401 on every call, so the fetcher fails early), POSTs `/clubmailv3/get_latest_message_list_of_conversation` (form: `cache_killer`, `data` JSON with `limit_before/after: 100`) and follows `content.page_up_parameter` (the full `data` of the next older page) until `null`. Each page is oldest → newest. Conversation ID: `conversation-wrapper-personal-<higher id>-<lower id>`; the other order gives 0 messages. Reading does not mark the conversation read. `toClubMailConversation(raw, owner, folder)` → `{ entries, messages }`: entries are absolute `<origin>/clubmailv3/attachment/download/?attachment_id&conversation_sample_id&message_id` URLs (use each message's `conversation_sample_id`, it can differ from the wrapper ID); the offscreen document fetches them with `credentials: 'include'` (host permission exists). `messages` (author, time, raw `content`, reply, attachment file) feed `renderConversationMarkdown` and `renderConversationHtml` (`lib/transcript.js`), which `toAlbumZipRequest` puts into `reports` as `ClubMail/conversation.md` and `ClubMail/conversation.html` when there are messages. `content` is HTML; `lib/clubmail-content.js` converts it without a DOM (allowlist: `<br>`, smiley `alt`, http(s) `<a>`, entities; other tags stripped). The HTML transcript decodes entities, then escapes every value (`escapeHtml`), and loads nothing remote. `toAlbumZipRequest(raw, date, clubMail)` always reserves the `ClubMail` folder; a ClubMail failure (`{ failed: true }`, a result without `messages`, or a failed/empty injection, which `extractAllWithProgress` maps to its fallback `{ failed: true }`) adds `ClubMail: unavailable` to `skipped.txt` and sets `clubMailFailed` (amber badge) instead of failing the click. After one fetcher rejects, `extractAllWithProgress` stops painting progress, so a late fetcher can't cover the red error badge.
- Firefox has no `chrome.offscreen`; the profile ZIP needs another path there.
- JoyClub renders profile album cards client-side: no card for ~0.5–2 s after load, then the main card briefly shows a default "Fotos von mir" before its real title. The GraphQL API has no main-album title, so `fetchProfileAlbums` waits (in parallel with the API calls) until the card title is unchanged for 500 ms, at most 3 s or until the API calls finish, whichever is later; otherwise the folder falls back to "Hauptalbum". The album overview (`/profile/fotos/…`) has the main card; an album page (`/profile/fotoalbum/…`) has none, so clicks there take at least ~3 s and name the folder "Hauptalbum".
- `ref/` and `sandbox/` hold real pages and downloads. They are gitignored — never commit their content. Commit only sanitised copies as test fixtures.

## Blueprint Repos
Always check these repos for new mechanisms, patterns, etc.; use them as blueprint. Do NOT re-invent the wheel.
- `/Users/christian.baumann/git_repos/_own/conf-export-ext`
- `/Users/christian.baumann/git_repos/_own/jira-ticket-exporter`
- `/Users/christian.baumann/git_repos/_own/ms-teams-chat-exporter`

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
  - **Integration tests** (Node.js, external calls mocked): only for behavior that cannot be verified at unit level. Live in `tests/integration/`; stub `globalThis.chrome` before dynamically importing `background.js`. Run with `npm test`.
  - **E2E tests** (Playwright, Chrome with extension loaded): popup UI, extension lifecycle, and flows that require a real browser context. Run with `npm run test:e2e`. Uses `headless: false` — Chrome extensions require it; use headless mode for everything else. Apply the **Automation in Testing** pattern: automate setup and result verification; let the human perform only steps that need a real website. Document every remaining manual step and why it cannot be automated.
  - **Visual debugging**: when automated assertions are insufficient to diagnose a failure, take a whole-browser screenshot via macOS `screencapture` (e.g. `screencapture -x /tmp/debug.png`) or via Playwright's `page.screenshot()`, then analyse the image.
- Automate every testing step that can be automated.
- `npm test` runs lint + unit/integration tests. `npm run test:e2e` runs Playwright E2E tests. Both must pass before committing.
- E2E fixture (`tests/e2e/fixtures.js`): persistent Chromium context with the extension loaded, plus a local HTTP server for the image. JoyClub URLs are served from sanitised HTML in `tests/e2e/fixtures/` via `page.route`. Playwright cannot click the toolbar icon, so tests call `globalThis.handleActionClick(tab)` inside the service worker.
- E2E album API: `routeJoyclubApi` in `fixtures.js` routes the token endpoint and GraphQL via `context.route`, which also catches the fetches of the injected fetcher. GraphQL is cross-origin with an `authorization` header, so the route answers the `OPTIONS` preflight (`Access-Control-Allow-Headers`/`-Methods`) and sends the fixed `Access-Control-Allow-Origin: https://www.joyclub.de` on every GraphQL answer. The token route is same-origin and needs no CORS headers.
- E2E ClubMail: `routeJoyclubApi` routes the message list (same-origin, no CORS). The conversation page is `tests/e2e/fixtures/conversation.html`. `context.route` does not reach the offscreen document (a hidden `background_page` target), so its attachment fetches go to a local HTTPS server (`joyclubServer` fixture, self-signed cert generated with `openssl` per run): Chrome runs with `--host-resolver-rules=MAP www.joyclub.de 127.0.0.1:<port>` and `--ignore-certificate-errors`. Tab requests are still caught by the routes first. Fixture data is synthetic (`tests/fixtures/clubmail-api.js`).
- Playwright saves downloads under GUID names, so E2E can assert only the filename the extension requested, not the name on disk. The real on-disk name is a manual check.
- The E2E browser runs with `--disable-features=LocalNetworkAccessChecks`: otherwise Chrome shows a permission prompt when the routed `https://www.joyclub.de` page loads its image from `127.0.0.1`, and `page.goto` hangs.
- After a Playwright upgrade run `npx playwright install chromium`, or launching fails with "Executable doesn't exist".
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
