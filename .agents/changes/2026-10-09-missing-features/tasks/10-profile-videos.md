---
id: 10
dependencies:
- 09
---

# Task 10: Profile videos in Videos/

Profile videos served as plain files go into `Videos/<Owner>_Videos_<nn>_<id>.mp4` in the profile ZIP; streamed videos are listed in `skipped.txt`.

## References

* `design.md#j-videos`
* `design.md#videos-only-as-plain-files`
* `../research-09-profile-videos.md`
* `lib/profile.js` (`fetchProfileAlbums`, `toAlbumZipRequest`, `skippedReport`)
* `lib/zip.js` (`fetchBytes` retries, progress)

## Work

* [ ] Fetch the video list in the tab, per the research (self-contained injected code)
* [ ] Map videos to entries in a reserved `Videos` folder (unique against album names, like `ClubMail`)
* [ ] Streamed videos → `Videos: <n> not supported (<format>)` in `skipped.txt`
* [ ] Videos count in the progress badge and the incremental record (task 06, if done)
* [ ] Synthetic fixtures, unit tests for mapping and the skip line, E2E for a profile with one video
* [ ] README and `CLAUDE.md` describe `Videos/`

## Verification

* [ ] A fixture profile with one mp4 gives `<Owner>/Videos/<Owner>_Videos_01_<id>.mp4`
* [ ] A streamed video appears in `skipped.txt`, not in the ZIP
* [ ] An album titled "Videos" gets `Videos-2`
* [ ] `npm test` and `npm run test:e2e` pass
