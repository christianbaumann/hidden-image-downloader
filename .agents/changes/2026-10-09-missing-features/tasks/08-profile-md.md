---
id: 08
dependencies:
- 07
---

# Task 08: profile.md in the profile ZIP

The profile ZIP holds `profile.md` at its root: the profile text, then one section per album with its description and the photo list (caption → relative file link).

## References

* `design.md#h-profile-text-and-captions`
* `design.md#profilemd-in-the-profile-zip-only`
* `../research-07-profile-text.md`
* `lib/profile.js` (`fetchProfileAlbums`, `toAlbumZipRequest`, `reports`)
* `lib/transcript.js` (Markdown rendering and link encoding to reuse)

## Work

* [ ] Extend `fetchProfileAlbums` (or the GraphQL queries) with the fields found in task 07; stays self-contained
* [ ] Pure renderer in `lib/` for `profile.md`; links encoded per path segment like the transcripts
* [ ] `toAlbumZipRequest` adds `profile.md` to `reports`; text missing → section left out, no failure
* [ ] Fixture data in `tests/fixtures/album-api.js` (synthetic); unit tests for the renderer and the request
* [ ] E2E: profile ZIP contains `<Owner>/profile.md` with the fixture text
* [ ] README and `CLAUDE.md` describe `profile.md`

## Verification

* [ ] `profile.md` shows the profile text and every saved album with its photos; links open the files in the extracted ZIP
* [ ] A profile without text or captions still gives a valid `profile.md` (album list only)
* [ ] The ClubMail-only ZIP has no `profile.md`
* [ ] `npm test` and `npm run test:e2e` pass
