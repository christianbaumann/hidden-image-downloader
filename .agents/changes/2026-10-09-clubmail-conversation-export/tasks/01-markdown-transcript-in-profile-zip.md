---
id: 01
dependencies: []
---

# Task 01: Markdown transcript in the profile ZIP

A profile click saves `ClubMail/conversation.md` next to the ClubMail attachments. The file holds the complete conversation with authors, times, replies, and inline links to the attachment files.

## References

* `../design.md#one-message-model-two-renderers`
* `../design.md#transcripts-are-text-files-in-the-zip-request`
* `../design.md#content-conversion-without-a-dom`
* `../design.md#layout`
* `../design.md#attachments-in-the-transcript`
* `../design.md#facts-from-the-live-session-2026-10-09`
* `lib/clubmail.js` (`fetchClubMailImages`, `toClubMailEntries`), `lib/profile.js` (`toAlbumZipRequest`), `lib/zip.js` (`buildZip` `reports`)
* Blueprint: `/Users/christian.baumann/git_repos/_own/ms-teams-chat-exporter/markdown.js` (`renderMarkdown`)

## Work

* [x] Extend the synthetic fixture `tests/fixtures/clubmail-api.js` with `content`, `from_user_id`, `from_user_name`, `from_user`, `create_time_ms`, `referred_message` and `attachment.file_name`
* [x] Add a pure content converter in `lib/` (markdown output): `<br>`, smiley `alt`, http(s) `<a>` → `[t](href)`, entity decoding, all other tags stripped
* [x] Add `toClubMailConversation(raw, owner, folder)` in `lib/clubmail.js` → `{ entries, messages }`; entries keep today's names, so `toClubMailEntries` is replaced or delegates to it
* [x] Add `renderConversationMarkdown` (title, export line, day headings, `**Author** · HH:MM`, reply quote, image/link per attachment, relative paths)
* [x] Make `toAlbumZipRequest` add `ClubMail/conversation.md` to `reports` when the conversation has messages; it takes the export date it already gets
* [x] Unit tests for converter, model (author fallbacks `from_user_name` → `from_user.name` → "Unknown", reply, attachment file names) and renderer
* [x] Extend the E2E test "adds the ClubMail attachments to the album ZIP" to assert `ClubMail/conversation.md`
* [x] Update README.md (ClubMail section) and CLAUDE.md (ClubMail path)

## Verification

* [x] The profile ZIP contains `ClubMail/conversation.md` with every fixture message, oldest first, grouped by day
  **Note:** Verified via E2E "adds the ClubMail attachments to the album ZIP" and unit `renderConversationMarkdown` "renders title, export line, day headings …"
* [x] Each attachment link in the md names a file that exists in `ClubMail/`
  **Note:** Verified via the same E2E test (links and ZIP entries asserted); names come from the same value as the entries (`toClubMailConversation`)
* [x] A reply shows `> Reply to <author>, <time>: <snippet>`
  **Note:** Verified via unit tests in `tests/unit/transcript.test.js` and the E2E test
* [x] A smiley becomes its alt text; a `javascript:` link keeps only its text
  **Note:** Verified via `tests/unit/clubmail-content.test.js` and the E2E test (`Hi :-) & bye`)
* [x] A profile without a conversation still has no `ClubMail/` folder; a ClubMail failure still gives `skipped.txt` and the amber badge
  **Note:** Verified via unit `toAlbumZipRequest with ClubMail` tests and E2E "a failing ClubMail API still saves the album ZIP and warns"
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 324 unit/integration tests, 11 E2E tests pass

## Implementation notes

* Deviations from the design:
  * The message model holds the raw HTML as `content` (not converted `text`), so each renderer converts it in its own way (task 02 needs the HTML branch). `attachment` also carries `name` (original `file_name`) for links to files that are not images.
  * Reply, text and attachment are separate blocks with a blank line between them, as in the blueprint. Without it, the text after a `> Reply …` line would continue the quote.
* Review fixes: user text, author, partner and attachment names are Markdown-escaped, so typed `[x](javascript:…)`, `![](https://remote)` or `<img onerror>` stay text. File links are percent-encoded (`#`, `%`). German and typographic entities are decoded.
* Open for task 03: a profile with only restricted or empty albums and a conversation with text only still throws `NothingToDownloadError`, because `buildZip` writes reports only when at least one entry loads. The design's "ZIP with only the two transcripts" for a conversation click needs that changed.
