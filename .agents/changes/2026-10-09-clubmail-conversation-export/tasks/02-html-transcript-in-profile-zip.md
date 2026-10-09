---
id: 02
dependencies:
- 01
---

# Task 02: HTML transcript in the profile ZIP

The profile ZIP also contains `ClubMail/conversation.html`: a self-contained, escaped page that shows the conversation with its images inline and opens offline.

## References

* `../design.md#self-contained-escaped-html`
* `../design.md#content-conversion-without-a-dom`
* `../design.md#attachments-in-the-transcript`
* `lib/clubmail.js` (`toClubMailConversation`, from task 01), the content converter from task 01

## Work

* [x] Add the html branch to the content converter: decode entities, then escape; keep `<br>` and http(s) `<a href>` only; smiley → alt text
* [x] Add `renderConversationHtml` with the same structure as the md (title, export line, days, author · time, `<blockquote>` for replies), an inline `<style>`, `<img src="<file>">` for images and `<a href="<file>">` for other files
* [x] Add `ClubMail/conversation.html` to the `reports` in `toAlbumZipRequest`
* [x] Unit tests: escaping of `<script>`, quotes and `&` in text, author names and file names; scheme allowlist; no remote URL in the output except message links
* [x] Extend the ClubMail E2E test to assert `ClubMail/conversation.html` and its `<img>` sources
* [x] Update README.md

## Verification

* [x] The profile ZIP contains `ClubMail/conversation.html` next to `conversation.md`
  **Note:** Verified via E2E "adds the ClubMail attachments to the album ZIP" and "a profile with only restricted albums …" (entry lists), unit `toAlbumZipRequest` "a conversation without attachments still gets its transcript"
* [x] Each `<img src>` names a file that exists in `ClubMail/`
  **Note:** Verified via E2E (img sources = ZIP entries) and unit "adds ClubMail/conversation.html with the same attachment files as the entries"
* [x] Message text with `<script>` shows as text and does not run
  **Note:** Verified via unit escaping tests (`contentToHtml`, `renderConversationHtml`) and an ad hoc Playwright run: a rendered page with `<script>`, `onerror`, `javascript:` and attribute-breakout payloads in partner, author, text, reply and file names opened from `file://` had 0 `<script>` elements and no payload ran
* [x] The page loads no remote resource (no remote `src` or stylesheet)
  **Note:** Verified via unit "loads no remote resource …", E2E (no remote `src`/`href`), and the same ad hoc Playwright run (0 non-`file:` requests; local `<img>` loaded)
* [x] `npm test` and `npm run test:e2e` pass
  **Note:** 343 unit/integration tests, 11 E2E tests pass

## Implementation notes

* `contentToHtml` and `escapeHtml` live in `lib/clubmail-content.js` next to `contentToMarkdown`; both renderers share the reply line (`replyLine`) with their own escaping.
* File names in `src`/`href` are percent-encoded (one path segment), then HTML-escaped.
* A stripped tag between two words leaves both spaces (`:-)  j`); HTML collapses them, so no normalisation was added.
* Review fixes: tests pin the scheme check (uppercase, leading space, entity-encoded `javascript:`) and a quote in an unquoted href. Boy scout: an `<a>` opened inside an open link dropped the outer link's text (md and html); it is now kept as plain text.
* Not fixed (safe, the allowlist still applies): `attribute()` can match `href=` inside another attribute's value.
