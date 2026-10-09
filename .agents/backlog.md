# Backlog

Findings not covered by an existing change.

- Album page main folder: on `/profile/fotoalbum/…` the ZIP names the main album folder "Hauptalbum" after a ~3 s wait, but the page has the real title in `h2.profile-headline`. Read it there and drop the wait (found in `changes/2026-10-09-missing-features/research-04-lightbox-context.md`).
- Photo hashtags: `profileAlbum.image.hashtag.byImageIdList(idList)` returns them (28 of 498 photos in a live sample); not in any design yet (found in `changes/2026-10-09-missing-features/research-07-profile-text.md`).
