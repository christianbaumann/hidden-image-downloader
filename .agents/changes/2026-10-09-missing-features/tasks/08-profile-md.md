---
id: 08
dependencies:
- 07
---

# Task 08: profile.md and profile.html in the profile ZIP

The profile ZIP holds `profile.md` and `profile.html` at its root: the profile text, then one section per album with its description and the photo list (title, description, hashtags → relative file link).

## References

* `design.md#h-profile-text-and-captions`
* `design.md#profilemd-in-the-profile-zip-only`
* `../research-07-profile-text.md`
* `lib/profile.js` (`fetchProfileAlbums`, `toAlbumZipRequest`, `reports`)
* `lib/transcript.js` (Markdown rendering and link encoding to reuse)

## Decisions (2026-10-09)

* Profile text converted to Markdown: escape first (`escapeMarkdown`), then `[b]` → `**`, `[i]` → `*`, `[p]` → paragraph; other tags stay as text; smiley codes come out as `\*kuss\*`
* HTML version `profile.html`, styled like `conversation.html` (escape every value, nothing remote, images inline)
* Every saved photo listed with its file link; title only when real (not `...`/`Profilbild`); description and hashtags when present
* Incremental ZIP: complete `profile.md`/`.html`; links to earlier photos use their full-ZIP names
* A changed profile text is new: the saved record keeps a fingerprint (hash of the text content, no export date); a change alone gives a ZIP with the profile files, transcripts and `skipped.txt`
* "Steckbrief" and "Vorlieben" stay out (backlog)

## Work

* [ ] Extend `fetchProfileAlbums` per `../research-07-profile-text.md` ("Consequences for task 08"): `DESCRIPTION_QUERY` (`Number(userId)`, parallel to the album list), album `description`, `CAPTIONS_QUERY` with hashtags; own try/catch each, `null` on failure; stays self-contained
* [ ] Pure renderers in `lib/` for `profile.md` and `profile.html`; links encoded per path segment like the transcripts
* [ ] `toAlbumZipRequest` adds both files to `reports`; text missing → section left out, no failure
* [ ] Incremental export: text fingerprint in the request and the saved record; `filterNewEntries` counts a changed fingerprint as new
* [ ] Fixture data in `tests/fixtures/album-api.js` (synthetic); unit tests for the renderer and the request
* [ ] E2E: profile ZIP contains `<Owner>/profile.md` and `<Owner>/profile.html` with the fixture text
* [ ] README and `CLAUDE.md` describe both files and the fingerprint

## Verification

* [ ] `profile.md` and `profile.html` show the profile text and every saved album with its photos; links open the files in the extracted ZIP
* [ ] A profile without text or captions still gives valid files (album list only)
* [ ] Markup typed in the profile text does not run in `profile.html`
* [ ] A changed profile text alone gives a ZIP with the profile files; an unchanged one gives "nothing new"
* [ ] The ClubMail-only ZIP has no profile files
* [ ] `npm test` and `npm run test:e2e` pass
