---
datetime: 2026-10-09
author: Christian Baumann
tags: [research, profile-text, captions, graphql]
---

# Research 07: profile text, album descriptions, photo captions

Live session, 2026-10-09 (playwright-cli, user's cookies, scratchpad only). The GraphQL operations come from JoyClub's own requests on a profile page and on an album page (`/profile/fotoalbum/<user>-<album>.…`), captured with `page.on('request')`. Every query below was then sent by hand with the token from `/webauth/access_token` (as `fetchProfileAlbums` does). Samples below are synthetic.

## Result

Everything task 08 needs comes from the GraphQL API at `https://apiv2.joyclub.com/graph/`. The DOM is not needed.

| Text | Source | Live coverage (21 profiles from the user's ClubMail list) |
|---|---|---|
| Motto, profile text, "Das mögen wir (nicht)" | `profileDescription.byUserId(userId: Int!).description { motto description like dislike }` | text on 21 of 21 profiles: `description` 21, `motto` 17, `like` 17, `dislike` 15 |
| Album description | `description` on `ProfileUnrestrictedRegularAlbumInterface` in `getProfileAlbumList` | 5 of 43 regular albums, on 2 profiles |
| Photo title | `profileAlbum.image.byIdList(idList).itemList[].result.title` | 498 photos: 298 real titles (on 18 of 21 profiles), 175 `...`, 25 `Profilbild` |
| Photo description | same item, `description` | 1 of 498 |
| Hashtags | `profileAlbum.image.hashtag.byImageIdList(idList)` | 28 of 498 |
| Main album title and description | none: JoyClub asks for neither on `mainAlbum` (`getProfileAlbumList`, `getMainAlbum`); a `description` field there was not tried | see CLAUDE.md, main album title |

## Queries

Profile text (JoyClub's `getProfileDescriptionByUserId`; `userId` is an `Int`, not an `ID`):

```graphql
query getProfileDescriptionByUserId($userId: Int!) { profileDescription { byUserId(userId: $userId) { __typename
  ... on ProfileDescription { description { __typename
    ... on BaseError { message }
    ... on Description { motto description like dislike } } }
  ... on ProfileByUserIdErrorResponse { errors { __typename ... on BaseError { message } } } } } }
```

Album description: add `description` to the `ProfileUnrestrictedRegularAlbumInterface` branch of the existing `LIST_QUERY` (JoyClub's own `ProfileRegularAlbumFragment` asks for it).

Photo title and description (JoyClub's `profileAlbumGetUserImage`). `byIdList` sits on the same `profileAlbum.image` object as `source.sourceByImageIdList`, so one request can fetch both (confirmed live on 2 profiles, no errors, both lists in the same order). Task 08 should still send it as its own request, see below:

```graphql
query getProfileAlbumImageSources($idList: [ID!]!) { profileAlbum { image {
  byIdList(idList: $idList) { itemList { id result { __typename
    ... on ProfileAlbumImageItemResultSuccess { title description } } } }
  source { sourceByImageIdList(idList: $idList) { itemList { id result { __typename
    ... on ProfileAlbumImageSourceSuccessResult { source { sourceListJson } } } } } } } } }
```

Sample shapes (synthetic):

```json
{ "profileDescription": { "byUserId": { "__typename": "ProfileDescription", "description": {
  "__typename": "Description", "motto": "", "description": "[p]Hallo *wink*\nwir sind …[/p]", "like": "[b]Sauna[/b]", "dislike": "" } } } }

{ "profileAlbum": { "image": { "byIdList": { "itemList": [
  { "id": "101", "result": { "__typename": "ProfileAlbumImageItemResultSuccess", "title": "Am See", "description": "" } },
  { "id": "102", "result": { "__typename": "ProfileAlbumImageItemResultSuccess", "title": "...", "description": "" } } ] } } } }
```

## Text format

- Fields are raw text, empty string when unset (not `null`).
- Line breaks are `\n` (in 42 of the 70 non-empty fields).
- BBCode in 7 of the 70 fields, only `[p]`, `[b]`, `[i]` (with closing tags). No HTML.
- Smileys as `*name*` codes (`*kuss*`, `*zwinker*`, `*alarm*`, about 40 different).
- JoyClub renders them via `POST /profile/beautify_text` (answers HTML); not needed.
- Markdown conversion, in this order: escape the raw text with `escapeMarkdown` (`lib/clubmail-content.js`), so smileys come out as `\*kuss\*`; then `[b]…[/b]` → `**…**`, `[i]…[/i]` → `*…*`, `[p]…[/p]` → paragraph. Any other `[tag]` stays as text (only 7 fields were sampled).
- Placeholder photo titles: `...` and `Profilbild` (JoyClub's default for the avatar photo). Earlier research also saw `Keine Beschreibung angegeben.` as `alt` text in the DOM; the API never returned it.

## DOM (for reference, not needed)

- Profile text renders client-side; the HTML from the server holds none of it. It appears about 1 s after load.
- `div.profile-description > section.profile-description-{motto,maintext,like,dislike}`, each with a `.profile-description-<kind>__text` child (`div` for motto, `p` otherwise). Empty sections are left out. Confirmed on 2 profiles.
- The DOM text is the rendered one (BBCode and smileys replaced), so it differs from the API text.
- "Steckbrief" (`div.profile-sed-card`) and "Vorlieben" (`.profile-erotic-prefs`) come from `getProfileSedCardDataByUserId` as enum keys and ratings (`height`, `hairColor`, `primaryPreferences { key rating }`). Turning them into text needs JoyClub's translations, so they are left out of task 08.

## Limits

- Restricted albums: no ids, so no titles; they stay in `skipped.txt` as before.
- Not checked: profiles whose text is hidden from the viewer. All 21 answered `ProfileDescription/Description`; an error branch (`ProfileByUserIdErrorResponse`, `BaseError`) exists and must leave the section out.
- Only `www.joyclub.de` was checked.
- Photo `description` was non-empty on a single photo of one profile, so its format is confirmed once only; album descriptions on 2 profiles, everything else on 18 or more.

## Consequences for task 08

- `fetchProfileAlbums` stays self-contained and gets:
  - `DESCRIPTION_QUERY` (operation `getProfileDescriptionByUserId`), sent with `{ userId: Number(userId) }`: the variable is `Int!` and `profileUserId` returns a string, which GraphQL rejects. It does not depend on the album list, so it runs in parallel with `loadAlbums()`.
  - `description` in the unrestricted branch of `LIST_QUERY`.
  - `CAPTIONS_QUERY` (`byIdList { title description }`) as its own request, returned as `captions` next to `sources`.
- `graph()` throws on any `errors`, and `fetchProfileAlbums` then fails the whole click. The profile text and caption requests therefore get their own try/catch and answer `null` on failure, so a missing text leaves its section out instead of failing the ZIP. That costs one more request than putting `byIdList` into `SOURCES_QUERY`, but a caption error can't stop the photo download.
- A caption result other than `ProfileAlbumImageItemResultSuccess` means no title, as `sourceUrls` treats non-success sources. The same goes for a `description` that is not `Description` (`BaseError`, `ProfileByUserIdErrorResponse`).
- `profile.md`: motto, profile text, likes, dislikes (empty ones left out); per album: title, description, then the photos with title (placeholders `...`/`Profilbild` dropped) and description, each linked to its file.
- Hashtags exist but are not in the design; left for later.
