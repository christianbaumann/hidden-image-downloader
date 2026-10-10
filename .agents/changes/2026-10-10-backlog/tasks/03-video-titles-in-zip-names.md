---
id: 03
dependencies:
- 02
---

# Task 03: Video titles in ZIP entry names

Profile ZIP video entries carry the video title before the id (`Videos/<Owner>_Videos_<nn>_<Title>_<id>.mp4`), using the same title rules as photos.

## References

* `design.md#item-3-titles-in-filenames` (data flow 3b, open check for 3b)
* `design.md#shared-placeholder-list`
* `../2026-10-09-missing-features/research-09-profile-videos.md` (`:28`, `:36`: `media_title`)
* `lib/video.js` (`fetchProfileVideos`, `toVideo`, `toVideoEntries`), `lib/filename.js` (`titleSegment`, `PLACEHOLDER_TITLES`, `photoStem`)
* `tests/fixtures/video-api.js`, `tests/unit/video.test.js`

## Work

* [ ] Live check: capture `media_title` of real videos and look for placeholder titles; add any to `PLACEHOLDER_TITLES`; record the result in this task
* [ ] `toVideo` (injected, self-contained) adds the raw `title` from `media_title`
* [ ] `toVideoEntries` filters placeholders and builds the name via `photoStem` with the title
* [ ] Unit tests (video with title, without, placeholder) and fixture update; update existing name assertions
* [ ] Update `README.md` and `CLAUDE.md` (profile videos note)

## Verification

* [ ] A video with a title is saved as `Videos/<Owner>_Videos_<nn>_<Title>_<id>.mp4`
* [ ] A video without title or with a placeholder title keeps today's name
* [ ] An incremental export still skips videos saved earlier (dedup by `videoId`)
* [ ] `npm test` and `npm run test:e2e` pass
