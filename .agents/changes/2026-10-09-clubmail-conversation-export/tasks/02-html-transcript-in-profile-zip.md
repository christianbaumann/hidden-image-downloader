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

* [ ] Add the html branch to the content converter: decode entities, then escape; keep `<br>` and http(s) `<a href>` only; smiley → alt text
* [ ] Add `renderConversationHtml` with the same structure as the md (title, export line, days, author · time, `<blockquote>` for replies), an inline `<style>`, `<img src="<file>">` for images and `<a href="<file>">` for other files
* [ ] Add `ClubMail/conversation.html` to the `reports` in `toAlbumZipRequest`
* [ ] Unit tests: escaping of `<script>`, quotes and `&` in text, author names and file names; scheme allowlist; no remote URL in the output except message links
* [ ] Extend the ClubMail E2E test to assert `ClubMail/conversation.html` and its `<img>` sources
* [ ] Update README.md

## Verification

* [ ] The profile ZIP contains `ClubMail/conversation.html` next to `conversation.md`
* [ ] Each `<img src>` names a file that exists in `ClubMail/`
* [ ] Message text with `<script>` shows as text and does not run
* [ ] The page loads no remote resource (no remote `src` or stylesheet)
* [ ] `npm test` and `npm run test:e2e` pass
