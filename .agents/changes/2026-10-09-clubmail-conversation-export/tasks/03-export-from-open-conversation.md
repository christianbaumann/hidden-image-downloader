---
id: 03
dependencies:
- 01
---

# Task 03: Export from an open conversation page

A click on an open ClubMail conversation saves `<Partner>_ClubMail_<timestamp>.zip` with the transcripts and attachments of that conversation only, without the album API.

## References

* `../design.md#trigger-on-an-open-conversation`
* `../design.md#partner-id-on-a-conversation-page`
* `../design.md#failure-and-empty-cases`
* `../design.md#progress`
* `../design.md#read-state`
* `background.js` (`handleActionClick`, `extractAllWithProgress`, `ERROR_REASONS`), `lib/profile.js` (`profileUserId`, `toAlbumZipRequest`), `lib/clubmail.js` (`fetchClubMailImages`)
* `tests/e2e/fixtures.js` (`routeJoyclubApi`, `joyclubServer`)

## Work

* [x] Add `clubMailConversationIds(url)` in `lib/clubmail.js` for `https://www.joyclub.(de|com)/[lang/]clubmail/conversation/conversation-wrapper-personal-<a>-<b>/`
* [x] Change `fetchClubMailImages` to take the user ids from the URL and drop the own id (`body[data-session-user-id]`); the profile path passes its single id
* [x] Add `toClubMailZipRequest(raw, date)` → `{ zipName: '<Partner>_ClubMail_<timestamp>.zip', entries, reports }`; partner name from the partner's messages; failure → a new typed error with the reason "ClubMail unavailable"; no messages → `NothingToDownloadError`
* [x] Dispatch in `handleActionClick`: conversation URL before `profileUserId`; reuse `extractAllWithProgress` and `downloadZip`
* [x] Unit tests for `clubMailConversationIds` (both id orders, language prefix, non-matching URLs) and `toClubMailZipRequest`
* [x] Integration test in `tests/integration/background.test.js`: a conversation URL never injects `fetchProfileAlbums`
* [x] E2E: sanitised conversation page in `tests/e2e/fixtures/`, route it, assert the ZIP name and content, and the red badge for a failing message API
* [x] Update README.md (new trigger, manual check: real conversation with replies, smileys and links; unread conversation stays unread) and CLAUDE.md (click dispatch)

## Verification

* [x] On a conversation URL the ZIP holds the same `ClubMail/` transcripts as the profile ZIP (md; html once task 02 is done) and the attachments, and nothing else
  **Note:** Verified via E2E `an open conversation saves a ClubMail-only ZIP named after the partner` and unit `toClubMailZipRequest holds the attachments and both transcripts…`.
* [x] The ZIP name starts with the partner's name, not the user's
  **Note:** Verified via unit `takes the partner name even when the user wrote first` and the E2E above (first fixture message is from the user).
* [x] The ids in either order in the URL give the same conversation
  **Note:** Verified via unit `drops the own id from the two ids of a conversation URL, in either order`.
* [x] A failing message API shows the red badge "ClubMail unavailable"; an empty conversation shows the "nothing to download" reason
  **Note:** Verified via E2E `a failing ClubMail API on a conversation shows the red badge` and the integration `ClubMail conversation ZIP` failure/empty cases.
* [x] No `read_conversation` request is sent
  **Note:** Verified via the conversation E2E: every context request is recorded; the message list request is seen, `read_conversation` is not. The real site is a manual check (README).
* [x] Profile and lightbox clicks behave as before
  **Note:** Verified via the unchanged profile/lightbox unit, integration and E2E tests (all pass).
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 371 unit/integration tests and 13 E2E tests pass.

## Notes

* Implementation details beyond the design:
  * `fetchClubMailImages(userIds)` also returns `partnerId`, so `toClubMailZipRequest` can find the partner's name (first named message of that id; a third user is ignored). The own profile (`[ownId]`) gives `{ origin, messages: [] }` without a request, so it gets no `ClubMail/` folder; two ids without the own one give `{ failed: true }`.
  * `buildZip` now returns a ZIP of the reports alone when there are no entries but reports exist. Without this, a conversation without attachments failed with "download failed", against the design ("a ZIP that holds only the two transcripts").
  * `ClubMailApiError` lives in `lib/profile.js` next to `AlbumApiError`; `toClubMailZipRequest` too, since it reuses `transcriptReports`.
  * The API-phase tooltip stays "loading album list and ClubMail" on a conversation page (design: no progress changes).
* Review fixes: the partner name skips nameless messages; integration test for a conversation without attachments.
* Live check 2026-10-09 (headed Chromium via `playwright-cli`, extension loaded, the user's session cookies), two real conversations:
  * ZIP names `<Partner>_ClubMail_<timestamp>.zip`; only `ClubMail/` (5 and 9 attachments, both transcripts); no attachment missing; badge cleared.
  * Transcripts match the raw API: 58/54 messages, 8/0 replies (8 blockquotes), 4/5 http(s) links kept, smileys as text (no remote `src`), 3 messages without `from_user_name` still attributed.
  * `conversation.html` opened from `file://` with all network aborted: 5/5 and 9/9 images load, 0 requests attempted; layout and reply quote checked on screenshots.
  * Unread: the UI's own `read_conversation` call on opening the page was aborted; the extension click sent none (0 after the click), and the unread conversation stayed unread.
  * ZIP name on disk in a normal Chrome: confirmed by the user on 2026-10-09.
  * Read state: the user confirmed on 2026-10-09 that unread conversations must stay unread, as implemented.
