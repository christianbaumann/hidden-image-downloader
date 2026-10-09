---
id: 12
dependencies:
- 11
---

# Task 12: FSK18 unlock before a download

JoyClub shows 18+ content only after the user re-enters their login password once per session ("Passwort für FSK18-Zugang", https://support.joyclub.com/hc/de/articles/360020425600). Locked, 18+ photos are pixelated small variants (`…/orig/image_180_pxl_<token>.jpg`) inside links to `/webauth/activate/fsk18/`. A click should check the session first: unlocked → go on; locked → open the unlock prompt for the user, wait until they entered their password, then go on. The extension never sees or handles the password.

The standard 18+ content that triggers the prompt comes from the user's own profile, BitPaerchen (user id `6407991`) (user decision 2026-10-09).

## References

* `tasks/11-context-menu-gaps.md` (full size, FSK18 gate)
* `content.js` (`FSK18_GATE_LINK`), `lib/hidden-image.js`, `lib/lightbox.js` (`imageCandidates`), `background.js` (`handleActionClick`, `handleMenuClick`)
* Profilverwaltung → "Sicherheit & Datenschutz" → "FSK18-Inhalte freischalten" → `/login/agecheck.html` → `identity.joyclub.com/ui/fsk18?…` (OAuth; rate limited: 403 "Zugangsdaten zu oft fehlerhaft eingegeben")

## Spike (live session, the user types the password)

* [ ] Which BitPaerchen content is 18+ and opens the prompt (URL), and whether `/login/agecheck.html` is the better trigger
* [ ] Lock signal without loading 18+ content: gated links on the page, a page attribute, an API field
* [ ] How the unlock is stored: new cookie vs. server-side flag behind `FUP_sid` (compare cookie names before/after, no values); does it survive a new tab, a reload, the service worker?
* [ ] Where the prompt ends: the redirect after a successful unlock (`/webauth/authenticated/` → `origin_url`?), so the extension can tell success from a closed tab
* [ ] After the unlock: does a reloaded page serve full-size URLs; does the gated link's `ori`/target give the album and photo id; can the album API (`getProfileAlbumImageSources`) return the full-size source by id
* [ ] Profile ZIP: does the album API withhold or pixelate 18+ photos while locked (compare one profile locked vs. unlocked)

## Work

* [ ] (after the spike) Detection, unlock tab flow and resume for the context menu and the toolbar click, with tests
* [ ] README and `CLAUDE.md` describe the flow

## Verification

* [ ] Locked session: a click on a gated photo opens the prompt; after the password the full-size photo is saved
* [ ] Unlocked session: no prompt, the photo is saved at once
* [ ] Prompt closed without password: the click ends with a clear badge, nothing pixelated is saved silently
* [ ] `npm test` and `npm run test:e2e` pass
