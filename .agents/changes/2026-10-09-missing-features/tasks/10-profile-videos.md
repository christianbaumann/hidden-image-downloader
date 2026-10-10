---
id: 10
dependencies:
- 09
---

# Task 10: Profile videos in Videos/

**Status:** In progress (2026-10-10). Not approved: the user's QuickTime check failed (no picture); fixed (see "QuickTime fix"). Open: the user's answers below. Fetch path: the tab gets list, sources and per-video CloudFront values; the offscreen document fetches the stream with them as signed-URL query (no cookies) and remuxes with mux.js (`design.md#j-videos`).

Profile videos go into `Videos/<Owner>_Videos_<nn>_<id>.mp4` in the profile ZIP: JoyClub's unencrypted HLS is fetched (highest rendition) and remuxed to mp4; encrypted or unplayable videos are listed in `skipped.txt`.

## References

* `design.md#j-videos`
* `design.md#videos-as-mp4-also-from-hls`
* `../research-09-profile-videos.md`
* `lib/profile.js` (`fetchProfileAlbums`, `toAlbumZipRequest`, `skippedReport`)
* `lib/zip.js` (`fetchBytes` retries, progress)

## Work

* [x] Fetch the video list in the tab, per the research (self-contained injected code)
  * **Note:** `fetchProfileVideos` in `lib/video.js` (list, data, signed values per video; no `track/watch`). Verified via `tests/unit/video.test.js` (incl. serialised like `executeScript`).
* [x] Map videos to entries in a reserved `Videos` folder (unique against album names, like `ClubMail`)
  * **Note:** `toVideoEntries`; `Videos` reserved in `toAlbumZipRequest`. Verified via `tests/unit/video.test.js`, `tests/unit/profile.test.js` › "toAlbumZipRequest with videos".
* [x] Fetch the highest rendition's playlist (by `BANDWIDTH`/`RESOLUTION`, not position; up to 1080×1920 and ~130 segments seen) and segments (per-video CloudFront cookies from `/aws/aws_signed_cookies`; never call `/aws/track/watch`)
  * **Note:** `fetchVideo` in `lib/zip.js`, `bestVariant` in `lib/hls.js`. CloudFront accepts the cookie values as signed-URL query (verified live), so the offscreen document needs no cookies. Verified via `tests/unit/hls.test.js`, `tests/unit/zip.test.js` › "buildZip videos".
* [x] Remux the TS segments to mp4 with `mux.js`, vendored in `vendor/` and pinned to the npm devDependency like JSZip
  * **Note:** `remuxToMp4`; `vendor/mux.min.js` 6.3.0, pinned (`tests/unit/vendor-muxjs.test.js`). Live finding: mux.js writes duration `0xFFFFFFFF` into `mvhd`/`tkhd`/`mdhd`, so AVFoundation showed 25–50 h; `remuxToMp4` sets them to 0 (fragmented-mp4 convention). Verified via `tests/unit/hls.test.js` and AVFoundation (see Verification).
* [x] Encrypted (`EXT-X-KEY`) or unplayable videos → `Videos: <n> not supported (<reason>)` in `skipped.txt`; in a locked FSK18 session `lightbox/data` has no `data-video` → `Videos: <n> not available (FSK18 locked)`, no bypass
  * **Note:** Verified via `tests/unit/zip.test.js` (encrypted → `unsupported`, skipped.txt line), `tests/unit/video.test.js` (locked line).
* [x] Videos count in the progress badge and the incremental record (task 06, if done)
  * **Note:** Each video is one progress unit; API phase 0 → 3 → 6 → 10 %. Records hold `videos` ids; an unsupported (encrypted) video is recorded too, since retrying it would give a ZIP of nothing and a red badge on every later click (found in review). Verified via `tests/integration/background.test.js` ("videos are built in the ZIP and recorded…", "a saved video is not zipped again", API phase) and `tests/unit/incremental.test.js` › videos.
* [x] Synthetic fixtures, unit tests for mapping and the skip line, E2E for a profile with one video
  * **Note:** `tests/fixtures/video/` (ffmpeg test pattern, 2 TS segments), `tests/fixtures/video-api.js`; E2E "remuxes a profile video into Videos/ as mp4 and lists a locked one in skipped.txt".
* [x] README and `CLAUDE.md` describe `Videos/`

## Verification

* [x] A fixture profile with one HLS video gives `<Owner>/Videos/<Owner>_Videos_01_<id>.mp4`, a valid mp4
  * **Note:** Verified via E2E "remuxes a profile video…" (entry name, `ftyp`) and the `remuxToMp4` output of the fixture: ffprobe h264 + aac 2.09 s, full ffmpeg decode clean, AVFoundation playable, 1.9 s.
* [ ] Live: a real profile video in the ZIP plays in QuickTime (manual testing required)
  * **Note:** Automated part done live 2026-10-10 (playwright-cli, extension loaded, user's cookies, profile named by the user): ZIP with 34 photos + 13 videos in 11 s, nothing missing, clean badge; all 13 mp4 h264 + aac at the highest variant (up to 1080×1920); ffmpeg decodes all cleanly; AVFoundation (QuickTime's framework) reports each playable with video and sound track and the right duration (±0.2 s of ffprobe); a second click → "nothing new" (34 photos, 13 videos recorded). Left to the user: open one in QuickTime Player and watch it.
* [x] An encrypted stream appears in `skipped.txt`, not in the ZIP
  * **Note:** Verified via `tests/unit/zip.test.js` › "an encrypted stream is neither zipped nor missing…" and "creates skipped.txt…". No live stream was encrypted.
* [x] An album titled "Videos" gets `Videos-2`
  * **Note:** Verified via `tests/unit/profile.test.js` › "an album titled Videos gets the folder Videos-2".
* [x] `npm test` and `npm run test:e2e` pass
  * **Note:** 639 unit/integration and 24 E2E tests passed (after the review fixes).

## Review (subagent, 2026-10-10)

* Fixed: unsupported video never recorded → red badge on every later click; a mux.js exception failed the whole ZIP (now only that video, `remux failed`); a partial `cookie_list` gave a broken query (now "not available"); version-1 box offsets dropped (mux.js writes version 0); the `zip:` log line counts unsupported videos; tests for no segments, mux.js throw, partial signed values.
* Left as is, for the user to decide: signed values expire after ~20 min, so on a very large profile late videos can land in `missing.txt`; up to 5 videos are held in memory at once; a failed video list only adds a `skipped.txt` line (no amber badge, unlike ClubMail); fMP4 or byte-range HLS would end in `missing.txt` (never seen live); badge texts still say "photos" while counting videos too.

## QuickTime fix (2026-10-10)

* User: the downloaded videos did not play. AVFoundation (`AVAssetReader` per track) read 0 video frames and only the sound from every mux.js output, including the fixture; ffprobe, ffmpeg and VLC played them, so the tests had not caught it. An ffmpeg `-c copy` of the same file decoded, so the cause was the container. Bisecting the box differences: mux.js writes sequence number 0 into every `mfhd`, and AVFoundation reads only the first `moof` (audio first, then video). `remuxToMp4` now numbers the fragments 1, 2, …
* **Note:** Verified via `tests/unit/hls.test.js` › "numbers the movie fragments 1, 2, …"; QuickTime and VLC screenshots of a synthetic 20 s clip (test pattern visible, VLC shows the right length without `mehd`); live: all 13 videos of the profile named by the user decode to the end in AVFoundation with picture and sound (e.g. 564 frames to 18.9 s).
* Files saved before the fix are recorded as saved: the user needs "Download everything again" to replace them.

## User answers (2026-10-10)

* [ ] Expired signed values: build the videos before the photos, and on a 403 ask the tab for fresh values and retry (1a + retry)
* [ ] Memory: leave as is (2c)
* [ ] Video list failure: amber badge "videos unavailable (<reason>)" and `log.txt` in the ZIP, like ClubMail (3a)
* [ ] Badge and tooltip texts: "files" instead of "photos" (4a)
* [ ] Support fMP4 (`EXT-X-MAP`) and byte-range (`EXT-X-BYTERANGE`) HLS properly (5b)
