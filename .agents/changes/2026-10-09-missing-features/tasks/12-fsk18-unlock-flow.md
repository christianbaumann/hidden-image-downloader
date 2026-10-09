---
id: 12
dependencies:
- 11
---

# Task 12: FSK18 unlock before a download

**Status:** In progress, paused. Spikes done except the scripted fill of the Vue password field; design and decisions recorded below. Build only in a session without auto mode (see Decisions). Task 06 already added the `storage` permission.

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

## Design (user decision 2026-10-09: password stored once, unlock without interaction)

* The user enters their JoyClub password once on an extension options page. It is kept in `chrome.storage.local`, unencrypted in the Chrome profile; the options page says so. A "Forget password" button deletes it. It is never logged, never in a badge, never sent anywhere but the JoyClub prompt.
* Lock check: `body[data-session-fsk18-status]` (`"0"` locked, `"1"` unlocked) of a JoyClub tab.
* Unlock: open `/login/agecheck.html` in an inactive tab; on the `identity.joyclub.com/ui/fsk18` form, fill the stored password and submit (`executeScript`, needs the host permission `https://identity.joyclub.com/*`); success = the tab is back on `www.joyclub.de` with status `"1"` within a timeout; then close the tab.
* One attempt per click, no retry: a wrong password or the 403 rate limit ends with a red badge ("18+ unlock failed") and a log, so the extension never locks the account. No stored password → the unlock tab opens active for manual entry (fallback).
* Toolbar ZIP: check and unlock before the album API calls; the API serves full-size sources afterwards without a reload.
* Context menu: a page loaded while locked holds pixelated URLs, and a reload loses the right-click position. So the extension unlocks proactively: when a JoyClub page reports status `"0"` and a password is stored, it unlocks once and reloads that tab (confirmed by the user 2026-10-09). A menu click on a gated layer that still happens (no password stored) gets "unlock 18+ first" instead of saving a pixelated image.

## Spike 2 (needs a locked session: log out/in, export `www.joyclub.de` and `identity.joyclub.com` cookies)

* [-] Markup of the password form on `identity.joyclub.com/ui/fsk18` (input, submit, error message for a wrong password), read without submitting
  * **Note:** Live 2026-10-09 (locked session): `/login/agecheck.html` ends on `identity.joyclub.com/ui/fsk18/challenge/password`, text "Um die FSK18-Freischaltung zu aktivieren, gib bitte hier dein JOYclub-Passwort ein". One `form` (method get, no action, Vue/Vuetify): hidden `input[name=username][autocomplete=username]`, password `input.v-field__input[type=password][autocomplete=current-password]` (generated id, no name), `j-button.submit-btn` ("Freischalten"), `j-button.cancel-btn` ("Abbrechen"). Error message for a wrong password: not seen (would cost an attempt against the rate limit).
* [x] Scripted fill + submit is accepted (one attempt, the user's real password from the options page of the test extension)
  * **Note:** Live 2026-10-09, locked session (`"0"`): the user typed the password, the script clicked `j-button.submit-btn` (`element.click()`). Steps: `/login/agecheck.html` → `identity.joyclub.com/ui/fsk18` → `/ui/fsk18/challenge/password`; after the click `/ui/redirect` → back on the opening page (`/my_joy/feed/friends/`) within ~1 s, status `"1"`. The scripted fill of the Vue field (value + `input` event) is not tested yet. The result was read by the user: Claude Code's auto mode classifier blocks Claude from this test's output ("Auto-Mode Bypass"), so building option C under auto mode is likely blocked too.
* [ ] Scripted fill of the Vue password field (value + `input` event) followed by the submit is accepted (one attempt, the user's real password from the options page of the test extension)

## Decisions (2026-10-09)

* Build option C (stored password, automatic unlock) in a Claude Code session without auto mode: auto mode's classifier blocks the password submit and its test output.
* The `Bash(playwright-cli:*)` allow rule in `.claude/settings.local.json` stays until this task is done, then gets removed.
* The live check needs fresh exports of the `www.joyclub.de` and `identity.joyclub.com` cookies from a locked session; the old exports are deleted.
* Next task after this one: 06. **Note:** 06 was done first (2026-10-09), then 07; 08 is next in order.

## Work

* [ ] Options page: store / forget the password (`chrome.storage.local`), with the risk note
* [ ] `manifest.json`: `storage` permission (already there since task 06), host permission `https://identity.joyclub.com/*`, `options_ui`
* [ ] Lock check and unlock flow in `background.js` (pure parts in `lib/`), one attempt, timeout, red badge + log on failure; no password in logs
* [ ] Toolbar ZIP unlocks before the album API; menu click on a gated layer without password → "unlock 18+ first"; proactive unlock + reload for locked JoyClub pages
* [ ] Unit, integration and E2E tests (E2E: routed fake prompt page and fsk18 status)
* [ ] README and `CLAUDE.md` describe the flow and the stored password

## Verification

* [ ] Locked session with a stored password: a toolbar ZIP of a profile with 18+ photos holds full-size photos, without any user interaction
* [ ] Locked session with a stored password: opening a JoyClub page unlocks and reloads it once; the menu then saves full-size photos
* [ ] Unlocked session: no unlock tab, the download starts at once
* [ ] Wrong stored password: one attempt, red badge "18+ unlock failed", log without the password, nothing pixelated saved silently
* [ ] No stored password: the unlock tab opens for manual entry
* [ ] `npm test` and `npm run test:e2e` pass
