---
id: 04
dependencies:
- 02
- 03
---

# Task 04: Chat bubbles in the HTML transcript and album links

Follow-up from the live check (2026-10-09): in `conversation.html` the user's own messages sit on the right, all others on the left, like JoyClub's chat view. Album notices (`Fotoalbum "we" von <Partner>`) arrive as `<j-a href="…">` and lost their link.

## References

* `../design.md#content-conversion-without-a-dom`, `../design.md#layout`
* `lib/clubmail.js` (`fetchClubMailImages`, `toClubMailConversation`), `lib/clubmail-content.js`, `lib/transcript.js`

## Work

* [x] `fetchClubMailImages` also returns the own id (`ownId`)
* [x] `toClubMailConversation` sets `isOwn` per message (`from_user_id` equals `ownId`); system notices without sender count as not own
* [x] `renderConversationHtml`: own messages as right-aligned bubbles, others left-aligned; inline CSS only
* [x] Content converter: `<j-a href>` is a link like `<a href>` (md and html; same scheme allowlist)
* [x] Unit tests for all of the above; README

## Verification

* [x] Own messages are right, the partner's and system notices left
  **Note:** Unit tests (`isOwn`, `class="message own"`), E2E conversation test (class sequence), live check: 33/31 own messages right, screenshot checked.
* [x] `Fotoalbum "…" von …` is a link in md and html; a `javascript:` `<j-a>` keeps only its text
  **Note:** Unit tests in `clubmail-content.test.js`; live check: the 3 album notices link to `/profile/fotoalbum/<id>-<album>.…html`.
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 376 unit/integration tests and 13 E2E tests pass.

## Notes

* System notices (album unlocks) have no `from_user_id`, so they show as "Unknown" on the left. A dedicated notice style is possible but was not requested.
* Live check: the persistent Chromium profile kept the old service worker modules after a code change; a fresh profile loaded the new code.
