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

* [ ] Add `clubMailConversationIds(url)` in `lib/clubmail.js` for `https://www.joyclub.(de|com)/[lang/]clubmail/conversation/conversation-wrapper-personal-<a>-<b>/`
* [ ] Change `fetchClubMailImages` to take the user ids from the URL and drop the own id (`body[data-session-user-id]`); the profile path passes its single id
* [ ] Add `toClubMailZipRequest(raw, date)` → `{ zipName: '<Partner>_ClubMail_<timestamp>.zip', entries, reports }`; partner name from the partner's messages; failure → a new typed error with the reason "ClubMail unavailable"; no messages → `NothingToDownloadError`
* [ ] Dispatch in `handleActionClick`: conversation URL before `profileUserId`; reuse `extractAllWithProgress` and `downloadZip`
* [ ] Unit tests for `clubMailConversationIds` (both id orders, language prefix, non-matching URLs) and `toClubMailZipRequest`
* [ ] Integration test in `tests/integration/background.test.js`: a conversation URL never injects `fetchProfileAlbums`
* [ ] E2E: sanitised conversation page in `tests/e2e/fixtures/`, route it, assert the ZIP name and content, and the red badge for a failing message API
* [ ] Update README.md (new trigger, manual check: real conversation with replies, smileys and links; unread conversation stays unread) and CLAUDE.md (click dispatch)

## Verification

* [ ] On a conversation URL the ZIP holds the same `ClubMail/` transcripts as the profile ZIP (md; html once task 02 is done) and the attachments, and nothing else
* [ ] The ZIP name starts with the partner's name, not the user's
* [ ] The ids in either order in the URL give the same conversation
* [ ] A failing message API shows the red badge "ClubMail unavailable"; an empty conversation shows the "nothing to download" reason
* [ ] No `read_conversation` request is sent
* [ ] Profile and lightbox clicks behave as before
* [ ] `npm test` and `npm run test:e2e` pass
