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

* [x] Which BitPaerchen content is 18+ and opens the prompt (URL), and whether `/login/agecheck.html` is the better trigger
  * **Note:** Live 2026-10-09: BitPaerchen's own albums are never gated for BitPaerchen (all `orig/image_1920`, no FSK18 links), so own content cannot trigger the prompt. The trigger is the nav item "FSK18 Freischaltung" (`li.menu_agecheck_login` → `/login/agecheck.html`), which shows "FSK18-Inhalte sind aktuell freigeschaltet" once unlocked. Deviation from the user's choice, to confirm.
* [x] Lock signal without loading 18+ content: gated links on the page, a page attribute, an API field
  * **Note:** `body[data-session-fsk18-status]`: `"0"` locked, `"1"` unlocked (live). Locked also: `li.menu_agecheck_login` in the nav, links to `/webauth/activate/fsk18/?origin_url=<page>?close_on_open=true` (only the page, no photo id), `…/image_180_pxl_<token>` sources.
* [x] How the unlock is stored: new cookie vs. server-side flag behind `FUP_sid` (compare cookie names before/after, no values); does it survive a new tab, a reload, the service worker?
  * **Note:** Server-side per session: cookie names unchanged after the unlock (`FUP_sid`, `FUP_sso_autologin`, `FUPlid`, `cf_clearance`, `__cf_bm`, `__zlcmid`); reloads keep it. The spike session used cookies exported from the user's browser, so it shares that session's unlock state.
* [x] Where the prompt ends: the redirect after a successful unlock (`/webauth/authenticated/` → `origin_url`?), so the extension can tell success from a closed tab
  * **Note:** Live 2026-10-09 (cookies of `www.joyclub.de` and `identity.joyclub.com`, user typed the password): `/login/agecheck.html` → 302 → 302 → password form on `identity.joyclub.com/ui/fsk18` → after submit 302 → 302 → 301 → back on the page that opened the prompt (here `/my_joy/feed/friends/`, no query), `body[data-session-fsk18-status="1"]`. Intermediate URLs were not captured (the recorder's `URL` cleanup failed in the run-code sandbox). Success test for the extension: the unlock tab is back on `www.joyclub.de` with status `"1"`; a closed tab or a status `"0"` means no unlock.
  * The prompt needs the `identity.joyclub.com` session (`SSOID`, `SSOAUTOID`, `VID`); without it: "401 - Session abgelaufen" (and earlier 403 "Zugangsdaten zu oft fehlerhaft eingegeben"). The user's Chrome has it.
  * Chrome's saved passwords are not readable by extensions (`passwordsPrivate` is internal to Chrome's settings pages); options for less interaction (autofill + auto-submit, password stored in the extension) are listed for the user's decision.
* [x] After the unlock: does a reloaded page serve full-size URLs; does the gated link's `ori`/target give the album and photo id; can the album API (`getProfileAlbumImageSources`) return the full-size source by id
  * **Note:** A reloaded page serves the photo with a different token at full size (`image_180_pxl_GB2iW` → `orig/image_1920_AWGiP`) and links it to its album (`#media_id_…`), so the pixelated URL cannot be converted; resume = reload, then read again. The gated link holds no photo id. Album API by id: see the profile ZIP item; after the unlock it returns full-size sources.
* [x] Profile ZIP: does the album API withhold or pixelate 18+ photos while locked (compare one profile locked vs. unlocked)
  * **Note:** Locked (live 2026-10-09, user 9032962 "Alhe123", 7 photos): `getProfileAlbumImageSources` answers `ProfileAlbumImageSourceSuccessResult` for all, but 6 have only `orig/image_180_pxl_<token>` as widest source, so the profile ZIP silently saves pixelated 180 px images. The toolbar ZIP needs the unlock check too. Unlocked (same profile, same session after the password): all 7 widest sources are `orig/image_1920_<token>` with new tokens (e.g. `image_180_pxl_GB2iW` → `image_1920_AWGiP`), no `_pxl_`.

## Work

* [ ] (after the spike) Detection, unlock tab flow and resume for the context menu and the toolbar click, with tests
* [ ] README and `CLAUDE.md` describe the flow

## Verification

* [ ] Locked session: a click on a gated photo opens the prompt; after the password the full-size photo is saved
* [ ] Unlocked session: no prompt, the photo is saved at once
* [ ] Prompt closed without password: the click ends with a clear badge, nothing pixelated is saved silently
* [ ] `npm test` and `npm run test:e2e` pass
