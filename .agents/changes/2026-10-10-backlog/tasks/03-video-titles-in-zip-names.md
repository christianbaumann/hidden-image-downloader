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

* [ ] Live check: capture `media_title` of real videos and look for placeholder titles; add any to `PLACEHOLDER_TITLES`; record the result in this task (manual testing required) **Note:** Not done: the session's auto-mode classifier refused the live-session subagent (PII). Also open: whether `media_title` carries HTML entities (`&amp;`); it is used raw. Until checked, videos share the photo placeholders (`...`, `Profilbild`)
* [x] `toVideo` (injected, self-contained) adds the raw `title` from `media_title` (only a non-empty string)
* [x] `toVideoEntries` filters placeholders and builds the name via `photoStem` with the title (`titleSegment`)
* [x] Unit tests (video with title, without, placeholder) and fixture update; update existing name assertions
* [x] Update `README.md` and `CLAUDE.md` (profile videos note)

## Verification

* [x] A video with a title is saved as `Videos/<Owner>_Videos_<nn>_<Title>_<id>.mp4` **Note:** Verified via unit test `puts a usable title before the id, sanitised like a photo title` and E2E `remuxes a profile video into Videos/ as mp4 …` (`Videos/TestOwner_Videos_01_Am-Strand_900001.mp4`, fixture `media_title` "Am Strand")
* [x] A video without title or with a placeholder title keeps today's name **Note:** Verified via unit tests `a placeholder or blank title keeps the name without title`, `leaves the title out when media_title is empty or missing` and the existing untitled name assertions in `profile.test.js`
* [x] An incremental export still skips videos saved earlier (dedup by `videoId`) **Note:** Verified via unit test `a video saved before it got a title in its name is still not new` (`incremental.test.js`)
* [x] `npm test` and `npm run test:e2e` pass **Note:** 704 unit/integration, 30 E2E passed
