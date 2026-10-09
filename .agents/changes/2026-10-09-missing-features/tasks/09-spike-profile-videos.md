---
id: 09
dependencies: []
---

# Task 09: Spike: profile video format

A research note states whether profiles have videos and how JoyClub serves them (mp4, HLS, DRM), so task 10 can be designed or dropped.

## References

* `design.md#j-videos`
* `design.md#videos-only-as-plain-files`
* `docs/agents/research/2026-10-08-jc-profile-slider-zip-download.md` ("Videos" slider)
* `CLAUDE.md` ("Live check against a real session")

## Work

* [ ] Find live profiles with videos (user's session, playwright-cli, scratchpad only)
* [ ] Record how the video list is loaded (DOM, GraphQL operation) and the media requests on playback (content type, manifest, DRM)
* [ ] Write `../research-09-profile-videos.md`: list source, format, sample request shapes (sanitised), access restrictions
* [ ] If no videos or only HLS/DRM: note it in `.agents/backlog.md`; task 10 reduces to the `skipped.txt` line or is dropped

## Verification

* [ ] The note names the video list source and the media format, confirmed on at least one live profile
* [ ] No real personal data in the repo
