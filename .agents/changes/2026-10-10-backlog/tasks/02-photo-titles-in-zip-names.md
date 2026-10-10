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

* [ ] Add `titleSegment` to `lib/filename.js` (NFC, `folderSegment` rules, cap `MAX_TITLE_LENGTH` 80 code points, Windows device names) and move `PLACEHOLDER_TITLES` there
* [ ] `photoStem` takes an optional `title`; the whole file name is capped at `MAX_FILENAME_BYTES` (200 UTF-8 bytes), cutting the title first, then the album, never owner, number, id or extension
* [ ] `toAlbumZipRequest` computes `captionsById` once and passes titles to `albumEntries`
* [ ] Percent-encode `#`, `%`, `&` in the report links of `profile.md`/`profile.html` (and wherever entry names become links)
* [ ] Unit tests for `titleSegment`, the byte cap, placeholders, entry names with titles and the encoded report links; update existing name assertions
* [ ] Update `README.md` (name format; a changed title renames later files only) and `CLAUDE.md` (single-image filename / ZIP naming notes)

## Verification

* [ ] A photo with title "Rück Ansicht" is saved as `<Owner>_<Album>_<nn>_Rück-Ansicht_<id>.jpg` in the ZIP
* [ ] Photos with title `...`, `Profilbild` or none keep `<Owner>_<Album>_<nn>_<id>.jpg`
* [ ] Forbidden characters, control chars and Windows device names in titles give valid names; `#`, `%`, `&` stay in the name
* [ ] A name with long emoji/CJK title and album stays ≤ 200 UTF-8 bytes and keeps owner, number, id and extension
* [ ] Links in `profile.md`/`profile.html` resolve to entries whose names contain `#`, `%`, `&`
* [ ] An incremental export still skips photos saved earlier (dedup by `photoKey`)
* [ ] `npm test` and `npm run test:e2e` pass
