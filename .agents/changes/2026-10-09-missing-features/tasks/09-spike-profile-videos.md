---
id: 09
dependencies: []
---

# Task 09: Spike: profile video format

**Status:** Done, awaiting approval (2026-10-09). Result: `../research-09-profile-videos.md`. Every profile video is unencrypted HLS; no plain mp4. Task 10 as designed reduces to the `skipped.txt` line; the user decides whether to keep it that way or design an HLS download.

A research note states whether profiles have videos and how JoyClub serves them (mp4, HLS, DRM), so task 10 can be designed or dropped.

## References

* `design.md#j-videos`
* `design.md#videos-only-as-plain-files`
* `docs/agents/research/2026-10-08-jc-profile-slider-zip-download.md` ("Videos" slider)
* `CLAUDE.md` ("Live check against a real session")

## Work

* [x] Find live profiles with videos (user's session, playwright-cli, scratchpad only)
  * **Note:** Profile named by the user (13 videos); the user's own profile has none (`lightbox/list` → `[]`).
* [x] Record how the video list is loaded (DOM, GraphQL operation) and the media requests on playback (content type, manifest, DRM)
  * **Note:** Not GraphQL: `POST /video/lightbox/list` and `/video/lightbox/data` (form `cache_killer` + `data`), master playlist in `media_html`, per-video CloudFront cookies from `GET /aws/aws_signed_cookies`; playlists `application/vnd.apple.mpegurl`, segments `video/MP2T`, no `EXT-X-KEY`.
* [x] Write `../research-09-profile-videos.md`: list source, format, sample request shapes (sanitised), access restrictions
* [x] If no videos or only HLS/DRM: note it in `.agents/backlog.md`; task 10 reduces to the `skipped.txt` line or is dropped
  * **Note:** Only HLS. Backlog entry "Profile videos as files" (join/remux as a separate feature). Task 10 status updated.

## Verification

* [x] The note names the video list source and the media format, confirmed on at least one live profile
  * **Note:** Verified live 2026-10-09: all 13 videos of one profile return an `hls/<id>.m3u8` source; one played in the lightbox (480×854, 4 renditions, 5 TS segments); mp4 guesses outside `hls/` → 403 (CloudFront policy covers `<guid>/hls/*` only).
* [x] No real personal data in the repo
  * **Note:** Verified via `grep` of the note and backlog for the profile's name, user id, video ids, GUID and title: no hits. Samples are synthetic; downloads, captures and cookies stayed in the scratchpad.
