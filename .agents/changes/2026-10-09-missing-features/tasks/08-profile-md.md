---
id: 08
dependencies:
- 07
---

# Task 08: profile.md and profile.html in the profile ZIP

**Status:** Done, verified live (2026-10-09); awaiting the user's approval.

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

* [x] Extend `fetchProfileAlbums` per `../research-07-profile-text.md` ("Consequences for task 08"): `DESCRIPTION_QUERY` (`Number(userId)`, parallel to the album list), album `description`, `CAPTIONS_QUERY` with hashtags; own try/catch each, `null` on failure; stays self-contained
* [x] Pure renderers in `lib/` for `profile.md` and `profile.html`; links encoded per path segment like the transcripts
* [x] `toAlbumZipRequest` adds both files to `reports`; text missing → section left out, no failure
* [x] Incremental export: text fingerprint in the request and the saved record; `filterNewEntries` counts a changed fingerprint as new
* [x] Fixture data in `tests/fixtures/album-api.js` (synthetic); unit tests for the renderer and the request
* [x] E2E: profile ZIP contains `<Owner>/profile.md` and `<Owner>/profile.html` with the fixture text
* [x] README and `CLAUDE.md` describe both files and the fingerprint

## Implementation notes

* Hashtags: `getProfileAlbumImageCaptions` asks for `hashtag.byImageIdList { hashtags }` in the same request as titles and descriptions, as JoyClub's own `profileAlbumGetUserImage` does (captured and used live in the task 07 spike, `ops-album.json`/`probe2.js`). Live 2026-10-09: plain strings without `#` (41 hashtags on 2 profiles); non-string elements are still dropped.
* Renderers live in `lib/profile-report.js`; `formatDate`, `formatTime` and `relativeUrl` are now exported from `lib/transcript.js`.
* Fingerprint: `profileTextHash` = FNV-1a (`fingerprint` in `lib/incremental.js`) over the four text fields. It covers only the profile text: changed captions or album descriptions alone give "nothing new". Records saved before this change have no hash, so the first click after the update gives one ZIP with the profile files.
* Not changed (review findings, accepted): single `\n` in `profile.md` is a soft Markdown break, as in the transcripts; `escapeMarkdown` does not escape setext/`---` lines (existing); photos that end up in `missing.txt` keep their (dead) link in the profile files (README says so).

## Verification

* [x] `profile.md` and `profile.html` show the profile text and every saved album with its photos; links open the files in the extracted ZIP **Note:** Verified via E2E `writes profile.md and profile.html whose links open the photos in the ZIP` (every md/html link decodes to an entry of the ZIP) and unit tests in `tests/unit/profile.test.js` › `toAlbumZipRequest profile files`, `tests/unit/profile-report.test.js`.
* [x] A profile without text or captions still gives valid files (album list only) **Note:** Verified via unit tests `… leaves out the profile text section and the fingerprint` (failed request, error answer, BaseError) and `renderProfileMarkdown` › `without profile text or captions: album list only`.
* [x] Markup typed in the profile text does not run in `profile.html` **Note:** Verified via unit test `escapes owner, titles, captions and hashtags` and E2E (`<script>` in the fixture text comes out as `&lt;script&gt;`, no `<script` in the page, nothing remote).
* [x] A changed profile text alone gives a ZIP with the profile files; an unchanged one gives "nothing new" **Note:** Verified via integration test `a changed profile text alone zips the profile files, and an unchanged one is nothing new` and unit tests in `tests/unit/incremental.test.js`.
* [x] The ClubMail-only ZIP has no profile files **Note:** Verified via unit test `toClubMailZipRequest` (report names) and E2E `an open conversation saves a ClubMail-only ZIP …` (exact entry list).
* [x] `npm test` and `npm run test:e2e` pass **Note:** 580 unit/integration, 23 E2E.
* [x] Live: a real profile ZIP shows the profile text, captions and hashtags correctly **Note:** Verified live 2026-10-09 (playwright-cli, user's cookies, scratchpad only) on a profile with BBCode, 3 album descriptions, 112 real titles, 1 photo description and 5 hashtags: 138 photos, 0 missing; `profile.md` has all four text sections and 6 albums; all 138 links in `profile.md` and 276 in `profile.html` resolve to files in the extracted ZIP; no leftover `[b]/[i]/[p]`, no placeholder titles, nothing remote; `profile.html` served from the extracted folder shows 138 images, none broken (screenshot checked). A second click gave "nothing new" with the hash in `saved:<id>`. macOS `/usr/bin/unzip` fails on the emoji album folder names (`Illegal byte sequence`); `ditto`/Archive Utility extract fine (not new to this task).
