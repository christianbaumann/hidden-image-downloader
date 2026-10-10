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

* [ ] Capture JoyClub's own `getProfileSedCardDataByUserId` request and response (`page.on('request')`), live with the user's cookies
* [ ] Find the translations: frontend bundle, an i18n endpoint, or only the rendered DOM
* [ ] Capture the rendered text of `div.profile-sed-card` and `.profile-erotic-prefs`
* [ ] Write `research-02-sed-card.md` in this change folder (sanitised: no real names, tokens or cookies)
* [ ] Add the chosen approach to `design.md`, or record that there is no usable source

## Verification

* [ ] `research-02-sed-card.md` holds the query shape, a sanitised response sample and the translation source (or why there is none)
* [ ] `design.md` names the approach for task 07
