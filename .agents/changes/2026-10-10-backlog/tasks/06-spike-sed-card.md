---
id: 06
dependencies: []
---

# Task 06: Spike: Steckbrief and Vorlieben

Find out how to get readable "Steckbrief" and "Vorlieben" text for a profile and choose between "API + translation table" and "rendered DOM text".

## References

* `design.md#item-2-steckbrief-and-vorlieben`
* `design.md#steckbrief-and-vorlieben-start-with-a-spike`
* `../2026-10-09-missing-features/research-07-profile-text.md` (`:74`)
* `CLAUDE.md` (live check with `playwright-cli`, cookies)

## Work

* [x] Capture JoyClub's own `getProfileSedCardDataByUserId` request and response (`page.on('request')`), live with the user's cookies
  **Note:** playwright-cli (plain Chromium, cookies via `context.addCookies`), `context.on('request')` on `apiv2.joyclub.com/graph/` over 9 profile pages; then sent by hand with the `/webauth/access_token` token from `/profile/fotoalbum/…` (200, `ProfileDescription`; a string `userId` is rejected).
* [x] Find the translations: frontend bundle, an i18n endpoint, or only the rendered DOM
  **Note:** Downloaded the ~400 scripts the profile page loaded and grepped for enum keys and German labels: de-DE dictionaries via `add_translations` in hashed entry files, enum → id → translation key mappings in hashed chunks. No i18n endpoint in the network log.
* [x] Capture the rendered text of `div.profile-sed-card` and `.profile-erotic-prefs`
  **Note:** `page.evaluate` walking text nodes including shadow roots (`j-tag` labels live there) on 8 profiles; counted cards on `/profile/fotos/…` and `/profile/fotoalbum/…` (0, and no sed-card request).
* [x] Write `research-02-sed-card.md` in this change folder (sanitised: no real names, tokens or cookies)
* [x] Add the chosen approach to `design.md`, or record that there is no usable source

## Verification

* [x] `research-02-sed-card.md` holds the query shape, a sanitised response sample and the translation source (or why there is none)
  **Note:** Checked by reading the file: query, synthetic sample with the real shape, bundle source and full de-DE tables; no names, user ids, tokens, cookies or photo URLs.
* [x] `design.md` names the approach for task 07
  **Note:** "Spike result (task 06)" under Item 2 and Key Decision "Steckbrief and Vorlieben from the API with a static translation table".
