---
id: 07
dependencies:
- 06
---

# Task 07: Steckbrief and Vorlieben in the profile report

`profile.md` and `profile.html` show "Steckbrief" and "Vorlieben" as readable text, using the approach chosen in task 06. If task 06 found no usable translation source, this task only adds a note to `.agents/backlog.md`.

## References

* `design.md#item-2-steckbrief-and-vorlieben` (plug-in points) and the addendum from task 06
* `research-02-sed-card.md`
* `lib/profile.js` (`loadAlbums`, `profileTextHash`), `lib/profile-report.js` (`renderProfileMarkdown`, `renderProfileHtml`)
* `tests/unit/profile.test.js`, `tests/unit/profile-report.test.js`, `tests/e2e/fixtures.js` (`routeJoyclubApi`)

## Work

* [x] Live check: one single profile (partner fields `null`?), a profile with `bodySize`/`cupSize`/`clothSize`/`shoeSize` set, the gender in the page's embedded data, the English labels next to the de-DE ones; record in `research-02-sed-card.md`
  **Note:** Done for the own couple profile, the page data and JoyClub's bundle (research-02 "Live check (task 07)"): gender from the header `j-gender-icon[universal-gender]` (the server JSON is gone after Vue mounts), pronoun mapping and field order from the bundle, sizes shown raw by JoyClub, en-GB labels from the logged-out `www.joyclub.com/en/` bundle, then compared live against JoyClub's logged-in English profile page (all labels, values, persons, ratings and 115 preference items match; research-02 "Logged-in English page"). Not checked: a single profile and a profile with sizes set; reading other members' sed cards in bulk was refused by the session's permission classifier (PII); the user chose to leave both to unit tests.
* [x] Translation module with de-DE and English tables, chosen by page language (German fallback); person labels "Sie"/"Er" from the page data, else "Person 1"/"Person 2"
  **Note:** `lib/sed-card.js` (`sedCardData`, `toSedCard`).
* [x] Fetch: `loadSedCard(token)` in the `Promise.all` of `loadAlbums`, `null` on any failure
* [x] Render `## Steckbrief` and `## Vorlieben` between "Profile text" and "Albums" in both reports (escaped like the other sections)
* [x] Fold the data into the `profileTextHash` input
* [x] Unit tests (data, `null`, escaping, fingerprint change) and E2E routing for the new operation
* [x] Update `README.md` and `CLAUDE.md`

## Verification

* [x] A profile ZIP's `profile.md`/`profile.html` list Steckbrief and Vorlieben as readable text
  **Note:** Verified via E2E `writes profile.md and profile.html whose links open the photos in the ZIP` and live: own couple profile ZIP with the extension, both sections per person, no raw enum codes (research-02).
* [x] An English page gives English labels; a single profile shows one person
  **Note:** Verified via `tests/unit/sed-card.test.js` (`an English page gets the English table`, `a single profile shows one person without a label`) and `tests/unit/profile.test.js` (`an English page gets English sed card labels`). Live 2026-10-10 (playwright-cli): English labels match JoyClub's logged-in English page of the own profile (research-02 "Logged-in English page"). A single profile stays unit-tested only (user decision, see Work). The English site's export itself fails because of a separate `/en/` path bug (`.agents/backlog.md`).
* [x] A failing sed card call leaves the sections out and does not fail the ZIP
  **Note:** Verified via `sed card <failure> → sedCard null, the rest stays` and `a failed sed card call leaves out both sections and keeps the text-only fingerprint` (`tests/unit/profile.test.js`).
* [x] A changed sed card alone gives an incremental ZIP with the profile files
  **Note:** Verified via integration test `a changed sed card alone zips the profile files`.
* [x] `npm test` and `npm run test:e2e` pass

## Deviation from the design

* Gender source: not the "data embedded in the profile page's HTML" (`div.profile_vue[data-profile-view-model]`, removed when Vue mounts, before any injected script runs) but the rendered header icon `.profile-base-info__line-1 j-gender-icon[universal-gender]`, present on profile, overview and album pages.
* Person labels follow JoyClub's full mapping instead of only "Sie"/"Er": male couples "Er 1"/"Er 2", female couples "Sie 1"/"Sie 2", other couples and an unknown gender "Person 1"/"Person 2". A single profile (single gender code, or no gender and no partner data) shows one person without a heading.
* `bodySize`, `cupSize`, `clothSize`, `shoeSize` get JoyClub's labels; the value stays raw, since JoyClub's card shows it raw as well.
* `hasBirthdayToday` is left out of the report and the fingerprint: it would change the fingerprint on the birthday and back the next day.
* English section headings are JoyClub's "Profile" and "Preferences".
* The fingerprint input stays the text fields alone when there is no sed card, so a failed sed card call does not count as a change.
