# Backlog

Findings not covered by an existing change.

- Album page main folder: on `/profile/fotoalbum/…` the ZIP names the main album folder "Hauptalbum" after a ~3 s wait, but the page has the real title in `h2.profile-headline`. Read it there and drop the wait (found in `changes/2026-10-09-missing-features/research-04-lightbox-context.md`).
- "Steckbrief" and "Vorlieben" in `profile.md`: `getProfileSedCardDataByUserId` returns enum keys and ratings only; readable text needs JoyClub's translations (found in `changes/2026-10-09-missing-features/research-07-profile-text.md`).
- Profile videos as files: every profile video is unencrypted HLS VOD (MPEG-TS, H.264/AAC), no mp4. Joining the highest rendition's segments gives a `.ts` (VLC only); `.mp4` needs a remux (e.g. vendored `mux.js`). Needs per-video CloudFront cookies from `/aws/aws_signed_cookies` (found in `changes/2026-10-09-missing-features/research-09-profile-videos.md`).
