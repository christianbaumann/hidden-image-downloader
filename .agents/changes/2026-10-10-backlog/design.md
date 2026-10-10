---
datetime: 2026-10-10T12:17:36+02:00
author: Christian Baumann
tags: [album-title, filenames, photo-titles, video-titles, sed-card, backlog]
---

# Backlog: album page title, titles in filenames, Steckbrief/Vorlieben

The three items in [`.agents/backlog.md`](../../backlog.md), chosen in a brainstorm on 2026-10-10:

| Id | Item | Stream | State |
|---|---|---|---|
| 1 | Album page main folder: use `h2.profile-headline`, drop the ~3 s wait | A | Ready |
| 3 | Photo and video title in ZIP entry names and the single-image name | A | Ready |
| 2 | "Steckbrief" and "Vorlieben" in `profile.md`/`profile.html` | B | Blocked: live spike first |

Sources:

- Current behaviour: [`CLAUDE.md`](../../../CLAUDE.md) (album path, single-image filename, context menu, incremental export, profile text)
- Album page headline and lightbox title: [`research-04-lightbox-context.md`](../2026-10-09-missing-features/research-04-lightbox-context.md)
- Profile text, captions, sed card: [`research-07-profile-text.md`](../2026-10-09-missing-features/research-07-profile-text.md) (`:74`)
- Video `media_title`: [`research-09-profile-videos.md`](../2026-10-09-missing-features/research-09-profile-videos.md) (`:28`, `:36`)
- Live finding that started item 1: [`tasks/12-fsk18-unlock-flow.md`](../2026-10-09-missing-features/tasks/12-fsk18-unlock-flow.md) (`:97`)

## Streams and order

Items 1 and 3 both change names built by `photoStem` (`lib/filename.js`) and share many test assertions, so they run one after the other in one stream. Item 2 touches only the profile report and runs on its own.

```text
Stream A   1 album title ──► 3a ZIP photos ──► 3b videos ──► 3c single image
Stream B   2 live spike ──► design addendum ──► implement (or backlog note)
```

Each slice is tested end to end and committed before the next one starts.

## Item 1: album page main folder

Today `fetchProfileAlbums` (`lib/profile.js`) polls for the main album card (`a.profile-album-card__link`, `MAIN_ALBUM_HREF`) for at least `TITLE_WAIT_MS` (3 s). Album pages have no cards, so the ZIP waits 3 s and names the folder `MAIN_ALBUM_FALLBACK_TITLE` ("Hauptalbum"). The context menu reads the headline (`albumTitle` in `content.js`), so the same photo gets two names:

```text
Context menu  SexWine69_Fotos-von-uns_01_aefe8c94.jpg
ZIP           Hauptalbum/SexWine69_Hauptalbum_01_aefe8c94.jpg
```

An album page can show any album. The URL tells which:

| URL | Album | Headline is | Main title source |
|---|---|---|---|
| `/profile/<uid>.…`, `/profile/fotos/<uid>.…` | – | – | card wait (unchanged) |
| `/profile/fotoalbum/<uid>.<slug>.html` | main | main album title | headline, no wait |
| `/profile/fotoalbum/<uid>-<albumId>.<slug>.html` | regular (`regularAlbumResultList[].id`) | that album's title (not verified live) | none: "Hauptalbum" at once, no wait |

The headline is read with the same rule as `content.js`: the last `h2.profile-headline` before the first `a.album-link` (the own profile has an earlier "Account" headline). `fetchProfileAlbums` is injected, so the rule is repeated inside it, like `DESCRIBE_ACTION`.

Tests:

- Unit (`tests/unit/profile.test.js`, `describe('fetchProfileAlbums')`): `stubDocument` gets `location` and `h2.profile-headline`; new cases for both album page kinds; the "gives up on a page without album cards" case changes.
- E2E: new sanitised fixture `tests/e2e/fixtures/album-regular.html`; a ZIP test on both album pages (folder name, no wait).
- Live: check that a regular album page's headline equals the API title of the album id in its URL.

Docs: `README.md:22`, `CLAUDE.md` (the "JoyClub renders profile album cards client-side" note).

## Item 3: titles in filenames

### Name format

```text
today   <Owner>_<Album>_<nn>_<id>.<ext>
new     <Owner>_<Album>_<nn>_<Title>_<id>.<ext>
        <Owner>_<Title>_<id>.<ext>          (single image without album context)
```

No title, or a placeholder title: the name stays as today.

### Title segment and length

```text
title ─► NFC ─► sanitizeSegment (forbidden chars, whitespace → '-', edge trim)
      ─► cap 80 code points ─► titleSegment
whole name ─► cap 200 UTF-8 bytes: cut title first, then album; never owner, nn, id, ext
```

- `titleSegment` in `lib/filename.js`, modelled on `folderSegment`. New constants `MAX_TITLE_LENGTH` (80), `MAX_FILENAME_BYTES` (200).
- `PLACEHOLDER_TITLES` (`...`, `Profilbild`) moves from `lib/profile.js` to `lib/filename.js`, shared by photos, videos and the single image.
- `#`, `%`, `&` are legal on macOS, Windows and Linux and stay in the name. The report links (`relativeUrl`, `markdownUrl` in `lib/profile-report.js`) must percent-encode them.

### Data flow per slice

| Slice | Title source | Change |
|---|---|---|
| 3a ZIP photos | `raw.captions` (`getProfileAlbumImageCaptions`, already fetched) | `toAlbumZipRequest` computes `captionsById` once and passes it to `albumEntries`; `photoStem` gets `title` |
| 3b videos | `media_title` in `/video/lightbox/data` items (not parsed yet) | `toVideo` (`lib/video.js`, injected) adds the raw `title`; `toVideoEntries` filters and sanitises it |
| 3c single image, profile and album pages | captions API by photo id, injected in the tab with the session token | `handleMenuClick` and the lightbox path pass `title` to `imageCandidates` → `buildFilename` |
| 3c single image, other pages | `.lb_img_title` (lightbox DOM; fixture `lightbox.html:20` "Rück Ansicht", `:26` `...`) | `extractLightboxData` and `content.js` read it per layer |

Open check for 3c: `data-photo` and the `#media_id_0_<id>_` id must be the same id that `profileAlbum.image.byIdList` takes. Check live before building on it.

Open check for 3b: videos may have placeholder titles of their own. Check live; add them to `PLACEHOLDER_TITLES` if found.

### Incremental export and reports

- Dedup is keyed by `photoKey`, `videoId`, `attachmentId` (`isSaved`, `lib/incremental.js`), not by name. Renaming is safe.
- Report links use `entry.name`, so they follow the new names.
- A title that changes between two exports gives a new name for later files only. The file saved earlier keeps its old name, but the new `profile.md` links to the new name. Documented in the README.

### Tests

About 100 filename assertions change, mostly in `tests/unit/profile.test.js`, `hidden-image.test.js`, `lightbox.test.js`, `filename.test.js`, `video.test.js`, `profile-report.test.js`, `tests/integration/background.test.js` and `tests/e2e/download.spec.js`. `tests/fixtures/album-api.js:58` defaults the title to `...`, so most profile names stay unchanged; new cases set a real title. ClubMail names do not use `photoStem` and stay unchanged.

## Item 2: Steckbrief and Vorlieben

Known: "Steckbrief" (`div.profile-sed-card`) and "Vorlieben" (`.profile-erotic-prefs`) come from `getProfileSedCardDataByUserId` as enum keys and ratings (`height`, `hairColor`, `primaryPreferences { key rating }`). Readable text needs JoyClub's translations. Nothing else is captured: no query text, no response sample, no translation source.

Spike (live, playwright-cli with the user's cookies, like research-07):

1. Capture JoyClub's own `getProfileSedCardDataByUserId` request and response (`page.on('request')`).
2. Find the translations: frontend bundle, an i18n endpoint, or only the rendered DOM.
3. Capture the rendered text of `div.profile-sed-card` and `.profile-erotic-prefs`.
4. Write `research-02-sed-card.md` in this folder and add the chosen approach to this design.

Plug-in points once the approach is known:

- Fetch: a `loadSedCard(token)` in the `Promise.all` of `loadAlbums` (`lib/profile.js`), `null` on any failure.
- Render: `## Steckbrief` and `## Vorlieben` between "Profile text" and "Albums" in `renderProfileMarkdown`/`renderProfileHtml` (`lib/profile-report.js`).
- Fingerprint: fold the data into the `profileTextHash` input (`lib/profile.js`).

If the spike shows no usable translation source, the item ends with a note in `.agents/backlog.md`.

### Spike result (task 06)

Details: `research-02-sed-card.md`. Approach for task 07: API + static translation table.

- Fetch: `getProfileSedCardDataByUserId` (`userId: Int!`, query in research-02) in `fetchProfileAlbums`, in parallel with the album list like `getProfileDescriptionByUserId`; answers the raw `profileDescription.byUserId` result, `null` on any failure or a non-`ProfileDescription` result. Works on album pages (checked by hand), which have no sed card in the DOM.
- Translate: a pure `lib/` module holds the de-DE tables copied from JoyClub's bundle (field labels, property values, 6 ratings, 66 preference keys) and maps the raw result; an unknown key or value stays as the raw enum string. `height`/`weight` as `<n> cm`/`<n> kg`; `null` fields left out.
- Render: per person (owner, then partner on couples) the properties, then "Vorlieben" grouped by rating in JoyClub's order (Unbedingt, Steh ich drauf, Situationsabhängig, Mag ich nicht so, Geht gar nicht, Möchte ich gerne ausprobieren), labels sorted with `localeCompare('de')`; `NONE` left out.
- Not available from the API: age and gender (the card's "34 Jahre" and "(Sie)/(Er)").

Answers to the open questions (2026-10-10):

- Person labels: read the gender from the data embedded in the profile page's HTML when present ("Sie"/"Er"), else "Person 1"/"Person 2". Never guess.
- Single profiles: check one live at the start of task 07; with `null` partner fields the report shows one person.
- `bodySize`, `cupSize`, `clothSize`, `shoeSize`: find a profile with them set during the task 07 live check and add labels; until then the raw value.
- Language: German and English tables. Task 07 captures the English labels live (en locale of JoyClub's bundle) next to the de-DE ones and picks the table by the page language (`<html lang>`), German as fallback.
- Request: a separate `getProfileSedCardDataByUserId` call, as JoyClub does; its failure leaves out only the two sections.

## Key Decisions

### One change folder for all three items

- **Decision:** One folder, `.agents/changes/2026-10-10-backlog/`, with one design. Tasks follow via `/create-tasks`.
- **Reason:** Items 1 and 3 touch the same naming code and tests; one design keeps the naming rules in one place.
- **Trade-offs:** Rejected three folders (overlap in `photoStem` and tests) and no design (item 3 has too many decisions).

### Two streams: "1 & 3" and "2"

- **Decision:** Stream A runs item 1, then item 3 (3a photos, 3b videos, 3c single image). Stream B runs item 2 on its own.
- **Reason:** Item 1 fixes the album part of the name that item 3 extends; item 2 shares no code with them.
- **Trade-offs:** Rejected running all three in parallel (conflicts in `photoStem` and tests) and item 3 first (names would change twice).

### The URL decides the main album title on album pages

- **Decision:** Main album page: headline, no wait. Regular album page: "Hauptalbum" at once, no wait. Profile and overview pages: card wait as today.
- **Reason:** No `fotoalbum` page has album cards, so the wait never helps there. On a regular album page the headline names that album, not the main one.
- **Trade-offs:** Rejected keeping the wait on regular album pages (3 s for nothing) and using the headline on every album page (wrong main folder name on regular album pages). The main folder stays "Hauptalbum" on regular album pages.

### Live check of a regular album page

- **Decision:** Check live during implementation, then add `album-regular.html` and an E2E ZIP test on both album pages.
- **Reason:** Only a main album page was checked live (research-04).
- **Trade-offs:** Costs a live session with exported cookies.

### Title before the id

- **Decision:** `<Owner>_<Album>_<nn>_<Title>_<id>.<ext>`, via `photoStem`.
- **Reason:** Sorting by number stays, the id stays last as a stable anchor, ZIP and single-image names stay alike.
- **Trade-offs:** Rejected the title after the id (reads worse) and the title without the id (collisions, no anchor).

### Title cap 80 code points, name cap 200 UTF-8 bytes

- **Decision:** `titleSegment` caps at 80 code points. The whole file name is capped at 200 UTF-8 bytes, cutting the title first, then the album.
- **Reason:** macOS and Linux allow 255 bytes per name; album (80) + title (80) in emoji or CJK reach ~650 bytes. 200 leaves room for Chrome's ` (1)` suffix and part of the Windows path budget.
- **Trade-offs:** Rejected 255 bytes (no margin) and no byte cap (failed downloads or extraction). Long titles get cut; the Windows 260-character path limit still depends on where the user extracts.

### Cross-platform sanitising, links encoded

- **Decision:** Titles use the `folderSegment` rules (forbidden chars `<>:"/\|?*`, control and `\p{Cf}` chars, edge trim incl. trailing dots and spaces, NFC), but no Windows device-name suffix: a title is never the whole name (owner and id surround it), and the suffix only gave `nul__<id>` (changed 2026-10-10 after task 02). `#`, `%`, `&` stay in the name; report links percent-encode them.
- **Reason:** The name must work on macOS, Windows and Linux; those three characters are legal on all of them.
- **Trade-offs:** The link encoding needs its own tests in `profile-report.test.js`.

### Single-image title from the captions API

- **Decision:** On profile and album pages, look the title up by photo id via the captions API, injected in the tab. On other pages read `.lb_img_title`.
- **Reason:** The album grid has no title in the DOM; only the API gives the same name as the ZIP.
- **Trade-offs:** One more API call per menu click on profile pages. Depends on `data-photo` being the API image id (open check). Rejected DOM only (names differ from the ZIP) and no titles for single images.

### Shared placeholder list

- **Decision:** `PLACEHOLDER_TITLES` moves to `lib/filename.js` and covers photos, videos and single images. Video-only placeholders are added if the live check finds any.
- **Reason:** One list, one rule for "no title".
- **Trade-offs:** Rejected no filter for videos and a separate video list.

### Changed titles rename later files only

- **Decision:** Accept it and document it in the README. Dedup stays keyed by id.
- **Reason:** Keeping old names would need the name in the saved record and more state for little gain.
- **Trade-offs:** After a title change, `profile.md` of a later ZIP links to a name that the earlier file does not have.

### Steckbrief and Vorlieben start with a spike

- **Decision:** Live spike first; choose between "API + translation table" and "rendered DOM text" afterwards.
- **Reason:** Neither the query nor a translation source is known.
- **Trade-offs:** Rejected deciding on DOM text now (works only on the profile page, needs a render wait, the album path has none) and deferring the item.

### Steckbrief and Vorlieben from the API with a static translation table

- **Decision:** Task 07 fetches `getProfileSedCardDataByUserId` in `fetchProfileAlbums` and translates the enums with static de-DE and English tables in a pure `lib/` module, chosen by page language; unknown values stay raw.
- **Reason:** The album path also runs on `/profile/fotos/…` and `/profile/fotoalbum/…`, which have no sed card in the DOM; the API answers there. JoyClub's labels exist only in hashed, per-release bundle files, so they can't be loaded at runtime by a stable URL.
- **Trade-offs:** Rejected rendered DOM text (profile page only, render wait, Lit shadow roots, duplicated desktop/mobile cards) and loading the bundle at runtime (hashed file names, minified mapping). The tables need an update when JoyClub adds options; new keys show as raw enum strings until then.
