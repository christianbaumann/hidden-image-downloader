---
id: 02
dependencies:
- 01
---

# Task 02: Photo titles in ZIP entry names

Profile ZIP photo entries carry the photo title before the id (`<Owner>_<Album>_<nn>_<Title>_<id>.<ext>`), sanitised for macOS, Windows and Linux and length-capped; photos without a title or with a placeholder title keep today's names.

## References

* `design.md#item-3-titles-in-filenames` (name format, title segment and length, data flow 3a, incremental export and reports, tests)
* `design.md#title-before-the-id`
* `design.md#title-cap-80-code-points-name-cap-200-utf-8-bytes`
* `design.md#cross-platform-sanitising-links-encoded`
* `design.md#shared-placeholder-list`
* `design.md#changed-titles-rename-later-files-only`
* `lib/filename.js` (`folderSegment`, `photoStem`), `lib/profile.js` (`PLACEHOLDER_TITLES`, `captionsById`, `toAlbumZipRequest`, `albumEntries`), `lib/profile-report.js`, `lib/transcript.js` (`relativeUrl`), `lib/clubmail-content.js` (`markdownUrl`)
* `tests/fixtures/album-api.js:58` (default title `...`)

## Work

* [x] Add `titleSegment` to `lib/filename.js` (NFC, `folderSegment` rules, cap `MAX_TITLE_LENGTH` 80 code points, Windows device names) and move `PLACEHOLDER_TITLES` there
* [x] `photoStem` takes an optional `title`; the whole file name is capped at `MAX_FILENAME_BYTES` (200 UTF-8 bytes), cutting the title first, then the album, never owner, number, id or extension
  * **Note:** `photoStem` also takes `extension` (the byte budget covers `<stem>.<ext>`); callers in `lib/profile.js`, `lib/video.js` and `buildFilename` pass it. The name stays `photoStem` and it still returns the stem.
* [x] `toAlbumZipRequest` computes `captionsById` once and passes titles to `albumEntries`
* [x] Percent-encode `#`, `%`, `&` in the report links of `profile.md`/`profile.html` (and wherever entry names become links)
  * **Note:** No code change needed: `relativeUrl` (`lib/transcript.js`) already encodes each segment with `encodeURIComponent`; covered by a new test.
* [x] Unit tests for `titleSegment`, the byte cap, placeholders, entry names with titles and the encoded report links; update existing name assertions
* [x] Update `README.md` (name format; a changed title renames later files only) and `CLAUDE.md` (single-image filename / ZIP naming notes)

## Verification

* [x] A photo with title "Rück Ansicht" is saved as `<Owner>_<Album>_<nn>_Rück-Ansicht_<id>.jpg` in the ZIP
  * **Note:** Verified via `tests/unit/profile.test.js` "puts the photo title before the key, sanitised" and E2E `download.spec.js` ("Am See" → `…_01_Am-See_00000001.jpg`)
* [x] Photos with title `...`, `Profilbild` or none keep `<Owner>_<Album>_<nn>_<id>.jpg`
  * **Note:** Verified via `profile.test.js` "keeps the name without title for placeholder, missing or failed captions" and E2E (photo `102` titled `...`)
* [x] Forbidden characters, control chars and Windows device names in titles give valid names; `#`, `%`, `&` stay in the name
  * **Note:** Verified via `filename.test.js` `titleSegment` tests and `profile.test.js` (`#1: 100% & mehr`, `nul`)
* [x] A name with long emoji/CJK title and album stays ≤ 200 UTF-8 bytes and keeps owner, number, id and extension
  * **Note:** Verified via `filename.test.js` `photoStem` cap tests and `profile.test.js` "keeps a long titled name within 200 UTF-8 bytes"
* [x] Links in `profile.md`/`profile.html` resolve to entries whose names contain `#`, `%`, `&`
  * **Note:** Verified via `profile.test.js` "links titled photos with #, % and & percent-encoded"
* [x] An incremental export still skips photos saved earlier (dedup by `photoKey`)
  * **Note:** Verified via `profile.test.js` "a photo saved before it got a title is not new"
* [x] `npm test` and `npm run test:e2e` pass
  * **Note:** Verified: 697 unit/integration, 30 E2E passed
