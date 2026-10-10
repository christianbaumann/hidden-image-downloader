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

* [ ] Live check: one single profile (partner fields `null`?), a profile with `bodySize`/`cupSize`/`clothSize`/`shoeSize` set, the gender in the page's embedded data, the English labels next to the de-DE ones; record in `research-02-sed-card.md`
* [ ] Translation module with de-DE and English tables, chosen by page language (German fallback); person labels "Sie"/"Er" from the page data, else "Person 1"/"Person 2"
* [ ] Fetch: `loadSedCard(token)` in the `Promise.all` of `loadAlbums`, `null` on any failure
* [ ] Render `## Steckbrief` and `## Vorlieben` between "Profile text" and "Albums" in both reports (escaped like the other sections)
* [ ] Fold the data into the `profileTextHash` input
* [ ] Unit tests (data, `null`, escaping, fingerprint change) and E2E routing for the new operation
* [ ] Update `README.md` and `CLAUDE.md`

## Verification

* [ ] A profile ZIP's `profile.md`/`profile.html` list Steckbrief and Vorlieben as readable text
* [ ] An English page gives English labels; a single profile shows one person
* [ ] A failing sed card call leaves the sections out and does not fail the ZIP
* [ ] A changed sed card alone gives an incremental ZIP with the profile files
* [ ] `npm test` and `npm run test:e2e` pass
