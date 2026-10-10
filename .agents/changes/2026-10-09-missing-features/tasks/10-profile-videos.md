---
id: 10
dependencies:
- 09
---

# Task 10: Profile videos in Videos/

**Status:** Ready (task 09 done 2026-10-10). Next: design the fetch path and remux location. User decision 2026-10-09: download HLS videos as mp4 (highest rendition, remux with vendored `mux.js`) instead of listing them in `skipped.txt`; see `design.md#videos-as-mp4-also-from-hls`. Task 06 is done, so videos also need a record key in `lib/incremental.js`.

Profile videos go into `Videos/<Owner>_Videos_<nn>_<id>.mp4` in the profile ZIP: JoyClub's unencrypted HLS is fetched (highest rendition) and remuxed to mp4; encrypted or unplayable videos are listed in `skipped.txt`.

## References

* `design.md#j-videos`
* `design.md#videos-as-mp4-also-from-hls`
* `../research-09-profile-videos.md`
* `lib/profile.js` (`fetchProfileAlbums`, `toAlbumZipRequest`, `skippedReport`)
* `lib/zip.js` (`fetchBytes` retries, progress)

## Work

* [ ] Fetch the video list in the tab, per the research (self-contained injected code)
* [ ] Map videos to entries in a reserved `Videos` folder (unique against album names, like `ClubMail`)
* [ ] Fetch the highest rendition's playlist (by `BANDWIDTH`/`RESOLUTION`, not position; up to 1080×1920 and ~130 segments seen) and segments (per-video CloudFront cookies from `/aws/aws_signed_cookies`; never call `/aws/track/watch`)
* [ ] Remux the TS segments to mp4 with `mux.js`, vendored in `vendor/` and pinned to the npm devDependency like JSZip
* [ ] Encrypted (`EXT-X-KEY`) or unplayable videos → `Videos: <n> not supported (<reason>)` in `skipped.txt`; in a locked FSK18 session `lightbox/data` has no `data-video` → `Videos: <n> not available (FSK18 locked)`, no bypass
* [ ] Videos count in the progress badge and the incremental record (task 06, if done)
* [ ] Synthetic fixtures, unit tests for mapping and the skip line, E2E for a profile with one video
* [ ] README and `CLAUDE.md` describe `Videos/`

## Verification

* [ ] A fixture profile with one HLS video gives `<Owner>/Videos/<Owner>_Videos_01_<id>.mp4`, a valid mp4
* [ ] Live: a real profile video in the ZIP plays in QuickTime (manual)
* [ ] An encrypted stream appears in `skipped.txt`, not in the ZIP
* [ ] An album titled "Videos" gets `Videos-2`
* [ ] `npm test` and `npm run test:e2e` pass
