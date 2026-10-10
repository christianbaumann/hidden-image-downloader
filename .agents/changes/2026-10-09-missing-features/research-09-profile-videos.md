---
datetime: 2026-10-09
author: Christian Baumann
tags: [research, profile-videos, hls, cloudfront]
---

# Research 09: profile videos

Live session, 2026-10-09 (playwright-cli, user's cookies, scratchpad only, FSK18 unlocked: `body[data-session-fsk18-status="1"]`); locked session 2026-10-10, see "Locked FSK18 session". One member profile with 13 videos, recorded with `page.on('request')`/`page.on('response')` while opening the lightbox and pressing play; then the same calls were sent by hand from the page. Ids, GUIDs and titles below are synthetic.

## Result

- Profiles have videos: the "Videos" slider (`div.profile-item-slider`, `heading="Videos"`, cards `.profile-video-card j-card`).
- Format: **HLS only** (`application/vnd.apple.mpegurl`, VOD playlists, MPEG-TS segments `video/MP2T`, H.264 + AAC, 4 renditions 144p–480p on the sample, 4 s segments). No `EXT-X-KEY` in any playlist: **no encryption, no DRM**.
- No plain mp4: the video URL is a master playlist, and the CloudFront access policy covers only `<guid>/hls/*`, so files outside `hls/` (e.g. `<guid>/<id>.mp4`, `<guid>/mp4/<id>.mp4`) answer 403 from CloudFront. Whether an mp4 exists there cannot be told; nothing on the page or in the API references one.
- Not GraphQL: the list and the sources come from JoyClub's older form-POST endpoints (same form as ClubMail: `cache_killer` + `data` JSON), not from `apiv2.joyclub.com/graph/`.

## Sources

| What | Where |
|---|---|
| Video list (all, not only the slider's first 10) | `POST /video/lightbox/list`, form `data={"media_set_id":0,"media_source":4,"media_user_id":<userId>}` → `content.media_key_list` (`["4_<mediaId>", …]`, newest first) |
| Slider cards (first 10) | `j-card[data-lightbox]` JSON: `id`, `user_id`, `title`, `source_type: 4`, `is_fsk18_blurred`, `identifier: "4_<id>_0_<userId>"` |
| Title, description, master playlist | `POST /video/lightbox/data`, form `data={"media_id_list":[<id>, …],"media_set_id":0,"media_source":4,"media_user_id":<userId>}` → `content.lightbox_data_list[<id>]` with `media_title`, `media_description_html`, `media_fsk18_blurred`, `media_html`; one call answered all 13 ids |
| Master playlist URL | inside `media_html`: `div.video_wrapper[data-video]` JSON `video_source` = `https://uservideo.joyclub.de/<guid>/hls/<id>.m3u8` (unsigned) |
| Access cookies | no access token needed; `GET /aws/aws_signed_cookies?mode=user&payload={"guid":"<guid>","contest_id":null,"preview_mode":false}` → JSON `content.cookie_list` (`CloudFront-Policy`, `CloudFront-Signature`, `CloudFront-Key-Pair-Id`), `domain: "joyclub.de"`, `path: "/"`, `expires`; JoyClub's script sets them as cookies (no `Set-Cookie`) |
| Thumbnail | `https://uservideo.joyclub.de/<guid>/thumbnails/<id>_tumb.<n>.jpg?Policy=…&Signature=…&Key-Pair-Id=…` (signed URL; the cookie policy does not cover it: 403) |

Sample `lightbox/data` item (synthetic, `media_html` shortened):

```json
{ "media_id": 900001, "media_set_id": 0, "media_title": "Beispiel", "media_description_html": "",
  "media_fsk18_blurred": false, "media_user_id": 1000001, "media_source": 4,
  "media_html": "<div class=\"video_wrapper …\" data-video=\"{&quot;video_source&quot;:&quot;https:\\/\\/uservideo.joyclub.de\\/00000000-0000-4000-8000-000000000001\\/hls\\/900001.m3u8&quot;,…}\" data-cookie-config=\"{&quot;identifier&quot;:&quot;user_00000000-…&quot;,&quot;modus&quot;:&quot;user&quot;,&quot;payload_json&quot;:&quot;{\\u0022guid\\u0022:…}&quot;}\">…</div>" }
```

Master playlist (sample, names shortened):

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=111824,…,CODECS="avc1.4d400b,mp4a.40.5",RESOLUTION=144x256,…
900001OttHlsTsAvcAac_9x16_144x256p_15Hz_0.2MbpsQvbrQ6.m3u8
…
#EXT-X-STREAM-INF:BANDWIDTH=415025,…,CODECS="avc1.4d401f,mp4a.40.5",RESOLUTION=480x854,…
900001OttHlsTsAvcAac_9x16_480x854p_30Hz_1.0MbpsQvbrQ7.m3u8
```

Media playlist: `#EXT-X-PLAYLIST-TYPE:VOD`, `#EXTINF:4,` + `<name>_00001.ts` … `#EXT-X-ENDLIST`, segment URIs relative.

## Access

- Playback sequence on JoyClub: `video/lightbox/list` → `video/lightbox/data` → `POST /aws/track/watch` (counts a view; the extension should not call it) → `GET /aws/aws_signed_cookies` → master → media playlist → segments.
- The signed cookies are per video (policy resource `https://uservideo.joyclub.de/<guid>/hls/*`, condition `DateLessThan` only) and expire after ~20 min. Fetches from the page (`credentials: 'include'`) to `uservideo.joyclub.de` pass CORS; `page.request` with the cookies got segment 200 (`AmazonS3`).
- An offscreen document cannot use `document.cookie` for `joyclub.de`; it would need the `cookies` permission (`chrome.cookies.set`), or the fetches run in the tab like `fetchProfileAlbums`.
- The sample cards carry an "Um Freischaltung bitten" overlay (`.profile-media-item-access-request-overlay`) and `is_fsk18_blurred: true` in the card JSON, yet `lightbox/data` returned `media_fsk18_blurred: false` and a playable source for all 13 videos in the unlocked session. Owner-restricted videos were not tested.

### Locked FSK18 session

Same profile, 2026-10-10, fresh cookies of a session with `body[data-session-fsk18-status="0"]`:

- `lightbox/list` still lists all 13 videos.
- `lightbox/data` answers every video with `media_fsk18_blurred: true` and a `media_html` without `data-video`: no playlist URL. `data-cookie-config` (with the GUID) is still there.
- Slider thumbnails come from `<guid>/thumbnails/pxl/<id>_tumb.<n>.jpg` (pixelated), like the `image_180_pxl_` photos.
- Not tried: requesting signed cookies or building `<guid>/hls/<id>.m3u8` by hand while locked. That would bypass JoyClub's FSK18 activation, which the extension deliberately does not do (`CLAUDE.md`, gated photos).
- Consequence: a video without `data-video` cannot be downloaded; task 10 lists it in `skipped.txt` (e.g. `Videos: <n> not available (FSK18 locked)`). Task 12's unlock check would make them downloadable.
- A profile without videos: `lightbox/list` answers `media_key_list: []`.

## Consequence for task 10

The original design ("Videos only as plain files") put HLS into `skipped.txt`. With this result every profile video is HLS, so task 10 as designed reduces to the line `Videos: <n> not supported (HLS)` (count from `lightbox/list`).

Chosen instead: HLS here is unencrypted VOD with one TS stream per rendition, so the extension could fetch the highest rendition's segments and join them. Concatenated TS segments play in VLC but not in QuickTime; an `.mp4` needs a remux (e.g. vendored `mux.js`). User decision 2026-10-09: task 10 does this (highest rendition, mp4 via vendored `mux.js`); see `design.md#videos-as-mp4-also-from-hls`.
