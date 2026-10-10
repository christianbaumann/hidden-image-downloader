# Backlog

Findings not covered by an existing change.

- Album page main folder: on `/profile/fotoalbum/…` the ZIP names the main album folder "Hauptalbum" after a ~3 s wait, but the page has the real title in `h2.profile-headline`. Read it there and drop the wait (found in `changes/2026-10-09-missing-features/research-04-lightbox-context.md`). The context menu already reads that headline, so the same photo gets two names: live 2026-10-10 on `/profile/fotoalbum/13928162.sexwine69.html` "Save hidden image" saved `SexWine69_Fotos-von-uns_01_aefe8c94.jpg`, the ZIP `Hauptalbum/SexWine69_Hauptalbum_01_aefe8c94.jpg` (found in task 12's live check). Fixing the ZIP name fixes both.
- "Steckbrief" and "Vorlieben" in `profile.md`: `getProfileSedCardDataByUserId` returns enum keys and ratings only; readable text needs JoyClub's translations (found in `changes/2026-10-09-missing-features/research-07-profile-text.md`).
- Photo and video title in the filename: add the title (photo `title` from `getProfileAlbumImageCaptions`, without the placeholders `...` and `Profilbild`; video `media_title` from `/video/lightbox/data`) to the ZIP entry names and the single-image name, sanitised and shortened. Names change, so `profile.md`/`profile.html` links and the incremental record (keyed by photo key and video id, not by name) need a check (user request 2026-10-10).
