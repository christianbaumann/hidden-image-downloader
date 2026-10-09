---
id: 03
dependencies: []
---

# Task 03: Add ClubMail attachments to the profile ZIP

A click on a profile also saves every attachment of the ClubMail conversation with that profile, in a `ClubMail/` folder of the same ZIP, without blocking the albums when ClubMail fails.

## References

* `design.md#clubmail-api-research-result`
* `design.md#collect-every-attachment-from-both-sides`
* `design.md#one-clubmail-folder-in-the-profile-zip`
* `design.md#separate-injected-fetcher-in-libclubmailjs`
* `design.md#clubmail-failure-does-not-block-the-album-zip`
* `design.md#zip-with-only-clubmail-content-is-valid`
* `design.md#always-on-no-paging-guard`
* `design.md#interfaces`
* `lib/profile.js` (`fetchProfileAlbums`, `toAlbumZipRequest`, `entryNumberWidth`, `SKIPPED_REPORT_NAME`)
* `lib/filename.js` (`sanitizeSegment`, `reserveUniqueName`)
* `background.js` (`handleActionClick`, `extractFromTab`, `downloadZip`, `showWarning`)
* `tests/e2e/fixtures.js` (`routeJoyclubApi`), `tests/e2e/fixtures/profile.html`, `tests/fixtures/album-api.js`
* `.agents/backlog.md` (item to remove once done)

## Work

* [x] New `lib/clubmail.js` with pure `clubMailConversationId(ownId, partnerId)` (higher ID first)
* [x] Injected, self-contained `fetchClubMailImages(partnerId)`: read `body[data-session-user-id]` and `body[data-cache-killer]`, POST `get_latest_message_list_of_conversation` with `limit_before/after: 100`, follow `page_up_parameter` until `null`, return `{ origin, messages }` or `{ failed: true }`; never throws
* [x] Pure `toClubMailEntries(raw, owner, folder)`: messages with an attachment, oldest first, absolute download URL (`/clubmailv3/attachment/download/?attachment_id&conversation_sample_id&message_id`), name `ClubMail/<Owner>_ClubMail_<nn>_<attach_id>.<ext>` with the extension from `file_type` and the album number width rule
* [x] Extend `toAlbumZipRequest(raw, date, clubMail)` in `lib/profile.js`: reserve `ClubMail` in `taken`, append ClubMail entries, add `ClubMail: unavailable` to `skipped.txt` and set `clubMailFailed` on failure, throw `NothingToDownloadError` only when albums and ClubMail are both empty
* [x] `background.js`: run both fetchers in parallel with `Promise.all`; show the amber warning when `clubMailFailed`, combined with the missing-photos reason in one tooltip
* [x] `extractAllWithProgress` (Task 02): once one fetcher rejects, a fetcher resolving later must not paint the blue progress badge over the red error badge (skip `showApiProgress` after a failure); integration test with one rejecting and one late-resolving fetcher
* [x] Unit tests: conversation ID order, paging with a fake `fetch` (multiple pages, empty conversation, missing `cache_killer`, HTTP error), entry naming, request merge and folder-name collision
* [x] E2E: route `get_latest_message_list_of_conversation` and `attachment/download` in `routeJoyclubApi` with synthetic data (no real mailbox content); add `data-session-user-id` and `data-cache-killer` to the profile fixture
* [x] Update README (ZIP layout, ClubMail), CLAUDE.md (ClubMail API, ID order, `cache_killer`, offscreen fetch of attachments); remove the item from `.agents/backlog.md`

## Verification

* [x] `clubMailConversationId('6407991', '13140627')` is `conversation-wrapper-personal-13140627-6407991`, and the reverse argument order gives the same ID **Note:** Verified via `tests/unit/clubmail.test.js` (`clubMailConversationId`).
* [x] With three pages of messages the fetcher returns all messages and stops at `page_up_parameter: null` **Note:** Verified via `tests/unit/clubmail.test.js` ('follows page_up_parameter over three pages …').
* [x] A profile without a conversation gives a ZIP without a `ClubMail/` folder and without a ClubMail line in `skipped.txt` **Note:** Verified via `tests/unit/profile.test.js` ('without a conversation there is no ClubMail folder …') and E2E 'downloads every accessible album into its own folder' (empty conversation routed).
* [x] E2E: a profile with albums and two ClubMail attachments gives one ZIP with the album folders and `ClubMail/<Owner>_ClubMail_01_<attach_id>.jpg`, `…_02_…` **Note:** Verified via E2E 'adds the ClubMail attachments to the album ZIP'.
* [x] E2E: a failing ClubMail API still saves the album ZIP, with `ClubMail: unavailable` in `skipped.txt` and an amber badge **Note:** Verified via E2E 'a failing ClubMail API still saves the album ZIP and warns' (checks `skipped.txt` text and badge color).
* [x] E2E: a profile with only restricted albums but ClubMail attachments saves a ZIP with only `ClubMail/` **Note:** Verified via E2E 'a profile with only restricted albums saves the ClubMail attachments'.
* [x] An album titled "ClubMail" gets the folder `ClubMail-2` **Note:** Verified via `tests/unit/profile.test.js` ('an album titled ClubMail gets the folder ClubMail-2').
* [x] `npm test` and `npm run test:e2e` pass **Note:** Verified: 289 unit/integration tests and 11 E2E tests pass after the review fixes.
* [ ] (manual testing required) Manual (needs a real session, not automatable): on a profile with a known conversation, the attachments are in `ClubMail/` with real bytes (the offscreen fetch sends the session cookie), and the conversation stays unread

## Deviations

* **E2E attachment server:** `context.route` does not reach the offscreen document (a hidden `background_page` target), so the attachment fetches cannot be routed as the design planned. The E2E Chrome maps `www.joyclub.de` to a local HTTPS server (`joyclubServer` fixture, per-run self-signed cert via `openssl`) with `--host-resolver-rules` and `--ignore-certificate-errors`. The message list is still routed in the tab.
* **Shared helper:** `entryNumberWidth` moved from `lib/profile.js` to `lib/filename.js` as `entryNumber(index, count)`, so `lib/clubmail.js` can use it without a circular import.
* **Extension fallback:** an unusable `file_type` gives `.bin`.
* **Review fixes:** an injection error or empty result of the ClubMail fetcher alone no longer fails the click; it counts as `ClubMail: unavailable` (fallback in `extractAllWithProgress`). A result without `messages` counts as failed too. Attachments without `attach_id` are skipped. The API-phase tooltip reads "loading album list and ClubMail".
