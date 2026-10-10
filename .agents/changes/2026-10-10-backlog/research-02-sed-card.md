---
datetime: 2026-10-10
author: Christian Baumann
tags: [research, sed-card, preferences, graphql, translations]
---

# Research 02: Steckbrief and Vorlieben

Live session, 2026-10-10 (playwright-cli, plain Chromium, user's cookies, scratchpad only). JoyClub's own GraphQL requests were captured with `context.on('request')` on 9 profile pages (all couple profiles, all `de`), then the query was sent by hand with the token from `/webauth/access_token` from an album page, as `fetchProfileAlbums` does. Samples below are synthetic or sanitised.

## Result

- The data comes from `getProfileSedCardDataByUserId` as enum keys, numbers and ratings. The same request works from `/profile/fotoalbum/…` (sent by hand, `200`, `ProfileDescription`).
- Readable German labels exist only in JoyClub's frontend bundle (`add_translations('de-DE', {...})`), reached from the enum through two minified mapping steps. No i18n endpoint was requested; all 35 `add_translations` calls on the page are `de-DE`.
- The rendered DOM has the text, but only on the profile page itself: `/profile/fotos/…` and `/profile/fotoalbum/…` have no `div.profile-sed-card` and send no sed-card request (checked on one profile).
- Recommendation: API + a static translation table (see below).

## Query

Operation `getProfileSedCardDataByUserId`, variable `userId: Int!` (a string id fails: `Int cannot represent non-integer value`).

```graphql
query getProfileSedCardDataByUserId($userId: Int!) {
  profileDescription {
    byUserId(userId: $userId) {
      __typename
      ... on ProfileDescription {
        properties {
          __typename
          ... on BaseError { message }
          ... on UserProperties {
            individualProperties { height weight smoker children hairColor eyeColor appearance bodySize cupSize clothSize shoeSize hasBirthdayToday zodiacSign }
            individualPropertiesPartner { height weight smoker children hairColor eyeColor appearance bodySize cupSize clothSize shoeSize hasBirthdayToday zodiacSign }
          }
        }
        interests {
          ... on Interests {
            individualInterests { ds sm sexualOrientation }
            individualInterestsPartner { ds sm sexualOrientation }
          }
        }
        preferences {
          ... on UserPreferences {
            primaryPreferences { key rating }
            partnerPreferences { key rating }
          }
        }
      }
      ... on ProfileByUserIdErrorResponse {
        __typename
        errors { __typename ... on BaseError { message } }
      }
    }
  }
}
```

JoyClub sends it with `profileDescription` (research-07's `getProfileDescriptionByUserId`) as separate requests; both hang off `profileDescription.byUserId`, so the fields could also go into one query.

## Response sample (synthetic values, real shape)

```json
{
  "data": { "profileDescription": { "byUserId": {
    "__typename": "ProfileDescription",
    "properties": {
      "__typename": "UserProperties",
      "individualProperties": {
        "height": 170, "weight": 60, "smoker": "NO", "children": "YES",
        "hairColor": "DARK_BLONDE", "eyeColor": "BLUE", "appearance": "SPORTY",
        "bodySize": null, "cupSize": null, "clothSize": null, "shoeSize": null,
        "hasBirthdayToday": false, "zodiacSign": "VIRGO"
      },
      "individualPropertiesPartner": {
        "height": 180, "weight": null, "smoker": "OCCASIONALLY", "children": null,
        "hairColor": "NONE", "eyeColor": "BROWN", "appearance": null,
        "bodySize": null, "cupSize": null, "clothSize": null, "shoeSize": null,
        "hasBirthdayToday": false, "zodiacSign": null
      }
    },
    "interests": {
      "individualInterests": { "ds": "SWITCH", "sm": null, "sexualOrientation": "BI_INTERESTED" },
      "individualInterestsPartner": { "ds": "RATHER_DOM", "sm": "NEITHER", "sexualOrientation": "HETEROSEXUAL" }
    },
    "preferences": {
      "primaryPreferences": [
        { "key": "TOYS", "rating": "ABSOLUTELY" },
        { "key": "KISSING", "rating": "LIKE" },
        { "key": "OUTDOOR", "rating": "DEPENDS" },
        { "key": "WEBCAM", "rating": "DISLIKE" },
        { "key": "INT_HAIR", "rating": "ABSOLUTELY_NOT" },
        { "key": "TANTRA", "rating": "TRY_OUT" }
      ],
      "partnerPreferences": [
        { "key": "MASSAGES", "rating": "LIKE" }
      ]
    }
  } } }
}
```

- `individual*` is the profile owner (first card, e.g. "Sie"), `*Partner` the second person of a couple. Single profiles were not checked; the partner fields are expected to be `null` there.
- Unset values are `null`; `hasBirthdayToday` is `false`. `height` (cm) and `weight` (kg) are integers.
- Live coverage over 18 persons (9 profiles): `height` 16, `hairColor` 16, `eyeColor` 16, `smoker` 14, `weight` 13, `appearance` 12, `zodiacSign` 12, `children` 8; `bodySize`, `cupSize`, `clothSize`, `shoeSize` never set, so their format is unknown (the editor treats `bodySize` as chest/waist/hip and `cupSize` as band/cup).
- Preferences: 0 to 66 entries per person; ratings seen `LIKE` 227, `DEPENDS` 231, `DISLIKE` 81, `ABSOLUTELY_NOT` 65, `ABSOLUTELY` 54, `TRY_OUT` 6. All 66 keys of the enum occurred.
- Not in this response: age and gender. The card's "34 Jahre" and "(Sie)/(Er)" come from server-embedded page data (`user_age`, gender), not from GraphQL.

## Translation source

Frontend bundle, release `joyclub-vue@26.41.0`, file names hashed per build (`/assets/js/entry/<hash>.js`, `/assets/js/chunks/<hash>.js`), so nothing can be loaded by a stable URL.

- Preferences: GraphQL key (`CCKLDNG`) → numeric id (`6`) → translation key (`profile_v3_erotic_preference_option_cuckolding`) → `Cuckolding`.
- Ratings: `profile_v3_erotic_preference_rating_*`. The card shows the `_single` variants per person, also on couple profiles.
- Properties: `user_properties_<field>_<value>` (e.g. `HairColor DARK_BLONDE` → `user_properties_hair_color_dark_blond` → `Dunkelblond`); labels `profile_v3_sed_card_*` (`Größe`, `Gewicht`, …).
- An older set (`user_properties_ep_*`, same German words) exists too; the profile card uses `profile_v3_*`.

### Tables (de-DE, as of 2026-10-10)

Labels: `height` Größe (`<n> cm`), `weight` Gewicht (`<n> kg`), `hairColor` Haarfarbe, `eyeColor` Augenfarbe, `appearance` Aussehen, `bodySize` Maße, `clothSize` Kleidergröße, `cupSize` Oberweite, `shoeSize` Schuhgröße, `sexualOrientation` Neigung, `zodiacSign` Sternzeichen, `ds` Dominant / Devot, `sm` Sadomaso, `smoker` Raucher, `children` Kinder, `hasBirthdayToday` Feiert heute Geburtstag. Unset value shown by JoyClub as `(keine Angabe)`.

| Field | Values |
|---|---|
| `hairColor` | `NONE` Keine, `BLONDE` Blond, `DARK_BLONDE` Dunkelblond, `BROWN` Braun, `RED` Rot, `BLACK` Schwarz, `GREY` Grau, `COLORFUL` Bunt |
| `eyeColor` | `BLUE` Blau, `GRAY` Grau, `GREEN` Grün, `BROWN` Braun, `GREY_BLUE` Graublau, `BROWN_GREEN` Braungrün |
| `appearance` | `CLASSIC` Klassisch, `CASUAL` Lässig, `SPORTY` Sportlich, `STYLISH` Modisch, `INDIVIDUAL` Individuell, `ALTERNATIVE` Alternativ |
| `smoker` | `NO` Nein, `YES` Ja, `OCCASIONALLY` Gelegentlich |
| `children` | `NO` Nein, `YES` Ja, ich habe Kinder, `YES_MOVED_OUT` Ja, wohnen aber nicht bei mir |
| `sexualOrientation` | `HETEROSEXUAL` Heterosexuell, `BI_INTERESTED` Bi-interessiert, `BISEXUAL` Bisexuell, `HOMOSEXUAL` Homosexuell, `PANSEXUAL` Pansexuell |
| `ds` | `NEITHER` Weder noch, `DOM` Dominant, `RATHER_DOM` Eher dominant, `SWITCH` Switcher, `RATHER_SUB` Eher devot, `SUB` Devot |
| `sm` | `NEITHER` Weder noch, `SAD` Sadistisch, `RATHER_SAD` Eher sadistisch, `SWITCH` Switcher, `RATHER_MAS` Eher masochistisch, `MAS` Masochistisch |
| `zodiacSign` | `ARIES` Widder, `TAURUS` Stier, `GEMINI` Zwillinge, `CANCER` Krebs, `LEO` Löwe, `VIRGO` Jungfrau, `LIBRA` Waage, `SCORPIO` Skorpion, `SAGITTARIUS` Schütze, `CAPRICORN` Steinbock, `AQUARIUS` Wassermann, `PISCES` Fische |

Ratings, in JoyClub's display order: `ABSOLUTELY` Unbedingt, `LIKE` Steh ich drauf, `DEPENDS` Situationsabhängig, `DISLIKE` Mag ich nicht so, `ABSOLUTELY_NOT` Geht gar nicht, `TRY_OUT` Möchte ich gerne ausprobieren. `NONE` (Keine Angabe) exists in the enum and is not shown.

Preferences (66):

`ANLSX` Analsex, `BDS` SM, BDSM, `BJ` Blowjob, `BLINDFOLD` Augen verbinden, `BODY_HAIR` Körperbehaarung, `BOND` Bondage, Fesseln, `CCKLDNG` Cuckolding, `CHATS` Erotische Chats, `CHUBBY` Mollig, `CORSETS` Korsetts & Corsagen, `CUDDLINGSX` Kuschelsex, `CUNNI` Cunnilingus, `DESSOUS` Dessous, `DRTY_TALK` Dirty Talk, `EXHIBI` Exhibitionismus, `FEET` Fußerotik, `FETI` Fetisch, `FFM` Dreier FFM, `FILMING` Filmen, `FKK` FKK, `FRI_PARTIES` Frivoles Ausgehen, `FSTNG` Fisting, `GANG` Gangbang, `GROUPSX` Gruppensex, `HAND` Handjob, `HIGH_HEELS` High Heels, `INT_HAIR` Intimbehaarung, `INT_JEWELRY` Intimschmuck, `INT_SHAVE` Intimrasur, `KAMASUTRA` Kamasutra, `KISSING` Küssen, `LATEX` Lack, Leder & Latex, `LET_WATCH` Zuschauen lassen, `MASSAGES` Massagen, `MAST` Selbstbefriedigung, `MFMF` Paarsex MFMF, `MMF` Dreier MMF, `NORMALSX` Normaler Sex, `NYLONS` Nylons, `NYM` Nymphoman, `OLDER_THAN_ME` Ältere, `OUTDOOR` Outdoor, `PHOTO` Fotografieren, `PI` Natursekt, `PICTURE_EXCHANGE` Bildertausch, `PIERCINGS` Piercings, `PRN` Pornos, `RIM` Rimming, `ROLE_PLAY` Rollenspiele, `ROUGHSX` Harter Sex, `SLIM` Schlank, `SLOWSX` Slow Sex, `SPECIAL_PLACES` Besondere Orte, `SPNK` Spanking, `SPRM` Spermaspiele, `SQURT` Squirting, `STRAPSX` Strapon-Sex, `STRP` Strip, `TATTOOS` Tattoos, `TELEPHONESX` Telefonsex, `TNTRA` Tantra, `TOYS` Sexspielzeug, `WATCH` Zuschauen, `WEBCAM` Webcam, `W_SHARING` Wifesharing, `YOUNGER_THAN_ME` Jüngere

The bundle also groups the 66 keys into five categories (Vergnügen oder Tabu, Spielarten, Körperliche Vorlieben, Lustvolle Abenteuer, Unterhaltung); the profile card does not use them.

## Rendered DOM

- `div.profile-sed-card` once per person, and the whole set twice (desktop and mobile layout, one hidden): 4 cards on a couple profile.
- Structure: `h2.sr-only` "Steckbrief (Sie)"; age `span` "34 Jahre"; `.profile-sed-card__property` with `.profile-sed-card__headline` + `.profile-sed-card__content` per field; then `.profile-erotic-prefs` > `.profile-erotic-prefs__category` (`h4.profile-erotic-prefs__category-title` = rating, `.profile-erotic-prefs__category-item-list` of `j-tag`).
- `j-tag` is a Lit web component: its label is only in its shadow root (`a.j-tag > span`), so `innerText` of the card shows the rating headings but no preferences.
- Within a rating, tags are sorted alphabetically by German label.
- The card is in a collapsed `j-expandable-content-box` ("Mehr anzeigen"); the text is in the DOM anyway.
- Rendered client-side about 1–2 s after `load`.

Sanitised text of one card, shadow roots included:

```text
Steckbrief (Sie) | 34 Jahre | Größe | 170 cm | Gewicht | 58 kg | Haarfarbe | Dunkelblond | Augenfarbe | Blau
| Aussehen | Sportlich | Neigung | Bisexuell | Sternzeichen | Jungfrau | Dominant / Devot | Switcher | Raucher | Nein
| Vorlieben | Steh ich drauf | Analsex | Augen verbinden | Blowjob | … | Situationsabhängig | Natursekt | …
| Mag ich nicht so | Dreier MMF | … | Geht gar nicht | Mollig
```

## Recommendation: API + translation table

| | API + static table | Rendered DOM text |
|---|---|---|
| Album pages (`/profile/fotos/…`, `/profile/fotoalbum/…`) | works (checked by hand) | no sed card there |
| Fits `fetchProfileAlbums` | one more GraphQL call next to `getProfileDescriptionByUserId` | needs waiting for client rendering, shadow-root walking, deduplicating desktop/mobile cards |
| Testable | pure mapping in a `lib/` module, Node unit tests | needs fixtures with shadow DOM |
| Upkeep | new enum values need a table update; fall back to the raw key | follows JoyClub's wording automatically |
| Language | German only (the table) | whatever the page shows |

- The fetcher returns the raw `byUserId` result (or `null` on any failure, like `profileText`); the translation table and rendering live in a pure `lib/` module used by `lib/profile-report.js`, so `fetchProfileAlbums` stays small and self-contained.
- An unknown key or value renders as the raw enum string, so a new JoyClub option is visible, not dropped.
- Locale: the user's session and all loaded translations are German (`de-DE`), and the existing reports are German-labelled. English translations were not seen; `www.joyclub.com` was not checked.

## Limits

- Only couple profiles were sampled; single profiles not checked.
- `bodySize`, `cupSize`, `clothSize`, `shoeSize` never set on the sample; format unknown.
- Age and gender (card heading pronoun) are not in the API response.
- The table is a snapshot of release `joyclub-vue@26.41.0`.

## Live check (task 07, 2026-10-10)

Headless Playwright Chromium with the user's cookies, scratchpad only. Only the user's own profile and JoyClub's public bundle were read: querying sed cards of other members in bulk to find a single profile or set sizes was refused by the session's permission classifier (PII), so those two points stay open.

- **Gender in the page:** the profile JSON `div.profile_vue[data-profile-view-model]` (`gender`, `is_couple_profile`, `user_age`, `user_age_2`) is only in the server HTML; Vue replaces the element on mount, so an injected script never sees it. The rendered header has `j-gender-icon[universal-gender]` next to `h1.profile-base-info__user-name` (inside `.profile-base-info__line-1`) on the profile page, `/profile/fotos/…` and `/profile/fotoalbum/…` (own couple profile: `3`). The sed cards on the profile page carry per-person icons (`2`, `1`), the album pages have none.
- **Universal gender enum** (bundle): `UNISEX 0, MALE 1, FEMALE 2, PAIR 3, MALE_PAIR 4, FEMALE_PAIR 5, MALE_TRANS 6, FEMALE_TRANS 7, NONBINARY 8, NONBINARY_FEMALE_PAIR 9, NONBINARY_MALE_PAIR 10, NONBINARY_NONBINARY_PAIR 11, TRANSFEMALE_FEMALE_PAIR 12, TRANSFEMALE_MALE_PAIR 13, TRANSFEMALE_NONBINARY_PAIR 14, TRANSFEMALE_TRANSFEMALE_PAIR 15, TRANSMALE_FEMALE_PAIR 22, TRANSMALE_MALE_PAIR 23, TRANSMALE_NONBINARY_PAIR 24, TRANSMALE_TRANSFEMALE_PAIR 25, TRANSMALE_TRANSMALE_PAIR 27`.
- **Pronouns** (bundle function `si(gender)`, used for the card heading "Steckbrief (%pronoun%)"): `PAIR`, `TRANSFEMALE_MALE_PAIR`, `TRANSMALE_TRANSFEMALE_PAIR` → `profile_v3_she`/`profile_v3_he` (Sie/Er, She/He); `MALE_PAIR`, `TRANSMALE_MALE_PAIR`, `TRANSMALE_TRANSMALE_PAIR` → Er 1/Er 2 (He 1/He 2); `FEMALE_PAIR`, `TRANSFEMALE_FEMALE_PAIR`, `TRANSFEMALE_TRANSFEMALE_PAIR` → Sie 1/Sie 2 (She 1/She 2); anything else → Person 1/Person 2. A single profile's card heading is just "Steckbrief" (`profile_v3_sed_card_headline_single`).
- **Field order and sizes** (bundle, `ProfileSedCard`): height (`cm`), weight (`kg`), hairColor, eyeColor, appearance, bodySize, clothSize, cupSize, shoeSize, sexualOrientation, zodiacSign; then ds, sm, smoker, children. `bodySize`, `clothSize`, `cupSize`, `shoeSize` are shown exactly as the API sends them (no unit, no translation), so their raw value is the readable text.
- **English labels:** a logged-in session gets only `de-DE` (`<html lang="de">`, `data-locale="de_DE"`; `www.joyclub.com` redirects to `www.joyclub.de` for it; `/en/profile/…` is a 404; `?lang=en` changes nothing). Logged out, `www.joyclub.com/en/` is `<html lang="en">`, `en_GB`, and its bundle holds the same 445 `profile_v3_sed_card_*`, `profile_v3_erotic_preference_*` and `user_properties_*` keys in `en-GB`. A logged-in English page was checked later the same day (see below); the tables pick English for `lang` `en…`.
- **Own couple profile** (`getProfileSedCardDataByUserId`, sent by hand from `/profile/fotoalbum/…`): `ProfileDescription`/`UserProperties`, both persons filled, `hasBirthdayToday` a boolean, `bodySize`/`cupSize`/`clothSize`/`shoeSize` `null` for both, 59 and 56 preferences.
- **Live profile ZIP** with the task-07 extension on the own `/profile/fotos/…` page: `profile.md` has `## Profile text`, `## Steckbrief` (`### Sie`, `### Er`; Größe, Gewicht, Haarfarbe, Augenfarbe, Aussehen, Neigung, Dominant / Devot, Sadomaso, Raucher), `## Vorlieben` (`### Sie`, `### Er`; Unbedingt … Geht gar nicht), then `## Albums`; no raw enum codes among 138 values; `profile.html` has the same `<h2>` and `<h3>` headings.

English tables (en-GB, same release):

- Labels: `height` Height, `weight` Weight, `hairColor` Hair colour, `eyeColor` Eye colour, `appearance` Appearance, `bodySize` Measurements, `clothSize` Clothing size, `cupSize` Bust size, `shoeSize` Shoe size, `sexualOrientation` Orientation, `zodiacSign` Star sign, `ds` Dom/sub, `sm` BDSM, `smoker` Smoker, `children` Children; headings "Profile" (`profile_v3_sed_card_headline_single`) and "Preferences".
- Values and the 66 preferences: in `lib/sed-card.js` (`ENGLISH_TABLE`), mapped from the de-DE label of each key to its translation key, then to en-GB.
- Ratings: Absolutely, I’m into it, Depends on the situation, Not for me, No way, I’d like to try it.

### Logged-in English page (2026-10-10, playwright-cli, fresh cookies)

- **Correction:** a logged-in session does get English. JoyClub's menu "Sprache: Deutsch" → "English" (`j-button[lang="en-GB"]`, base64 target in `data-linkmsq`) leads to `www.joyclub.com/en/my_joy/feed/friends/`; a direct visit to that URL works the same (`<html lang="en">`, logged in). Switching back via "Deutsch" restores `www.joyclub.de` with `lang="de"`. The earlier redirect and 404 came from paths without the `/en/` prefix.
- **Labels match:** our `toSedCard(…, { language: 'en', gender: 3 })` for the own couple profile against JoyClub's own English profile page (`div.profile-sed-card` per person, `j-tag` texts in shadow DOM): headings "Profile"/"Preferences", persons She/He, all 9 labels, all 14 values and all 115 preference items appear, the 5 rating headings too (Absolutely … No way).
- **Bug (outside task 07):** on `www.joyclub.com`, a path without the `/en/` prefix redirects to `www.joyclub.de`. The fetchers' relative endpoints (`/webauth/access_token` → 401, `/video/lightbox/list` → CORS `TypeError`) fail, so a toolbar click on `www.joyclub.com/en/profile/fotos/…` ends in `AlbumApiError` (videos `network error`). With `/en/webauth/access_token` the token is valid. Recorded in `.agents/backlog.md`.
- Still not checked live: a single profile and a profile with sizes set (the user chose unit tests only, since querying other members' sed cards is refused by the permission classifier).
