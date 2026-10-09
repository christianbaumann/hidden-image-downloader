---
datetime: 2026-10-09T08:57:15+02:00
author: Christian Baumann
tags: [profile-zip, clubmail, progress, retries]
---

# ClubMail attachments, ZIP progress and fetch retries

Three additions to the profile ZIP (click on `/profile/…`, `/profile/fotos/…`, `/profile/fotoalbum/…`):

- **Retries:** failed photo fetches are retried before they end up in `missing.txt`.
- **Progress:** the toolbar badge shows how far the ZIP is.
- **ClubMail:** the attachments of the ClubMail conversation with that profile go into the ZIP as one more folder.

Sources:

- Backlog item: [`.agents/backlog.md`](../../backlog.md) ("Include ClubMail images in the profile ZIP")
- Existing album ZIP: [`docs/agents/plans/2026-10-08-profile-albums-zip.md`](../../../docs/agents/plans/2026-10-08-profile-albums-zip.md), [`CLAUDE.md`](../../../CLAUDE.md) (album path, offscreen ZIP)
- ClubMail API: researched live on 2026-10-09 with the user's session (see below). Not documented by JoyClub.

## Current flow and what changes

The new parts go into the existing pipeline like this:

```text
handleActionClick (profile URL)                         background.js
├── executeScript(fetchProfileAlbums, [userId])          lib/profile.js   (unchanged)
├── executeScript(fetchClubMailImages, [userId])   NEW   lib/clubmail.js  (in parallel)
├── toAlbumZipRequest + toClubMailEntries          NEW   merge into one { zipName, entries, reports }
└── downloadZip
    └── offscreen build-zip                              offscreen.js
        └── buildZip                                     lib/zip.js
            ├── fetchBytes + retries               NEW
            └── zip-progress messages → badge      NEW
```

The resulting ZIP:

```text
<Owner>_<YYYY-MM-DD_HHmmss>.zip
├── Fotos-von-uns/<Owner>_Fotos-von-uns_01_<photo-id>.jpg
├── <Album>/…
├── ClubMail/<Owner>_ClubMail_01_<attach_id>.<ext>      NEW, oldest first
├── skipped.txt                                          + "ClubMail: unavailable" on failure
└── missing.txt
```

## ClubMail API (research result)

All calls are same-origin (`www.joyclub.de` or `www.joyclub.com`) and use the session cookie. They run inside the tab, like the album fetcher. The service worker makes none. No new host permissions.

```text
1. Read from the DOM (works from the isolated world):
     OWN = document.body.dataset.sessionUserId
     CK  = document.body.dataset.cacheKiller          (missing → 401 on every call)

2. Conversation ID, higher user ID first (verified 21/21; wrong order → 0 messages):
     conversation-wrapper-personal-<max(OWN, partner)>-<min(OWN, partner)>

3. POST /clubmailv3/get_latest_message_list_of_conversation
     headers: x-requested-with: XMLHttpRequest
     form:    cache_killer=CK
              data=JSON { conversation_id, offset_message_id: null,
                          limit_before: 100, limit_after: 100,
                          inclusive: false, allow_blank_personal: true }
     → content.message_list[]     oldest → newest within a page
       content.page_up_parameter  complete `data` object for the older page, or null

   loop: data = page_up_parameter until null
   no conversation → status 200, message_list: []

4. Per message with has_attachment:
     attachment { attach_id, file_type (".jpg"), file_size, file_width, file_height,
                  is_viewable, attached_upload_id, attached_gallery_id }
   GET /clubmailv3/attachment/download/
       ?attachment_id=<attach_id>
       &conversation_sample_id=<message.conversation_sample_id>
       &message_id=<message.id>
     → original file (verified: image/jpeg, size matches file_size)
```

Verified facts:

- Paging: 54 messages in 4 pages of 15, back to the first message. `limit_before: 100` is accepted.
- **No side effect:** fetching the message list of an unread conversation did not change its unread count or `last_read_message_id`.
- `conversation_sample_id` can differ from the wrapper ID. Use the value of each message.

## Key Decisions

### Collect every attachment, from both sides

- **Decision:** All attachments of the conversation go into the ZIP, from both participants and of every type. The file extension comes from `file_type`.
- **Reason:** The ZIP is a complete archive of what was shared with that profile.
- **Trade-offs:** Non-image files (PDFs, videos) land in `ClubMail/` too. Rejected: images only; partner's attachments only.

### One `ClubMail/` folder in the profile ZIP

- **Decision:** `ClubMail/<Owner>_ClubMail_<nn>_<attach_id>.<ext>`, numbered oldest first. The number width follows the album rule (`001` from 100 entries). `<Owner>` is the owner from the album fetcher.
- **Reason:** Same naming scheme as the album folders, so the ZIP stays uniform.
- **Trade-offs:** The file name does not carry the message date. Rejected: date-based names; files in the ZIP root.

### Separate injected fetcher in `lib/clubmail.js`

- **Decision:** `fetchClubMailImages(partnerId)` is self-contained (CLAUDE.md: injected functions are serialised) and runs through `executeScript` in parallel with `fetchProfileAlbums`. It returns raw messages or `{ failed: true }`. The pure `toClubMailEntries(raw, owner, …)` builds `{ url, name }` entries. `background.js` appends them to the album request.
- **Reason:** Two different APIs (GraphQL vs. `clubmailv3` form posts) stay in two modules. Running in parallel adds no wait time; the album fetcher already waits up to ~3 s for the main album title.
- **Trade-offs:** Two `executeScript` calls per click. Rejected: extending `fetchProfileAlbums`; running the fetchers one after the other.

### ClubMail failure does not block the album ZIP

- **Decision:** If the ClubMail fetcher fails (`{ failed: true }`, no `cache_killer`, HTTP error), the album ZIP is still saved. `skipped.txt` gets the line `ClubMail: unavailable` and the badge turns amber. An album API failure keeps its current behavior (red badge "album list unavailable").
- **Reason:** ClubMail is an addition. Losing it must not cost the albums.
- **Trade-offs:** The amber badge is shared with "photos missing", so the tooltip has to name the cause. Rejected: failing the whole click; ignoring the failure silently.

### ZIP with only ClubMail content is valid

- **Decision:** If every album is empty or restricted but the conversation has attachments, the ZIP holds only `ClubMail/` (plus reports). The error "no lightbox image or profile photos found" fires only when both sides are empty.
- **Reason:** The user wants the attachments even from a profile without visible photos.
- **Trade-offs:** None relevant.

### Always on, no paging guard

- **Decision:** ClubMail is part of every profile ZIP, with no setting. The fetcher follows `page_up_parameter` until `null`, with no page limit.
- **Reason:** No options page exists (YAGNI). Paging ended reliably in the research.
- **Trade-offs:** A misbehaving API that never returns `null` would keep the click busy. Accepted on purpose.

### Retries in `fetchBytes`

- **Decision:** Up to 2 retries with exponential backoff (1 s, 2 s) for network errors, timeouts, HTTP 429 and 5xx. No retry for other 4xx. Named constants `FETCH_RETRIES`, `RETRY_BASE_DELAY_MS`. The delay function is injectable, so unit tests run without real waits.
- **Reason:** Transient CDN and rate-limit errors are the likely cause of `missing.txt` entries. Permanent errors (404, 403) do not get better with a retry.
- **Trade-offs:** A photo that keeps failing costs up to ~3 s more plus 3× the 30 s timeout. Rejected: retrying every failure; one retry round after the batch.

### Progress on the badge

- **Decision:** During the ZIP build the badge shows the count while it fits in 4 characters (`9/80`), otherwise the percentage (`37%`). Background color is a new constant `BADGE_PROGRESS_COLOR` (blue). The tooltip always shows `n of m photos`. At the end the badge is cleared or replaced by the result badge (amber/red).
- **Reason:** The user asked for a mix of count and percentage. The badge holds about 4 characters, so the count works only for small numbers.
- **Trade-offs:** The badge switches format during one run (`9/80` → `13%`). The open clarification on this point was not answered, so this is the default option. Rejected: notification or popup UI.

### Combined percentage across API and photo phase

- **Decision:** The API phase fills 0–10 %, the photo phase 10–100 %. The service worker sets the API steps itself: API percent = resolved fetchers / fetcher count × 10 % (with album and ClubMail fetcher: 0 → 5 → 10 %). No progress messages from the tab.
- **Reason:** The photo total is unknown until both fetchers return. A fixed share gives visible feedback without new messaging from the tab. Counting fetchers instead of hard-coding steps lets progress and ClubMail ship in either order.
- **Trade-offs:** The API steps are coarse. The open clarification on this point was not answered, so this is the default option. Rejected: estimating time from earlier runs.

### Progress messages from the offscreen document

- **Decision:** `buildZip` takes an `onProgress(done, total)` callback. `offscreen.js` sends `{ target: 'background', action: 'zip-progress', jobId, done, total }`, throttled to one message per whole percent. `build-zip` carries a `jobId` so the service worker can map progress to its tab when two ZIP jobs run at once.
- **Reason:** `buildZip` stays pure and testable. The offscreen document has no tab ID.
- **Trade-offs:** One more message type between offscreen and service worker.

## Interfaces

The planned signature changes and new functions:

```diff
 lib/zip.js
-buildZip(entries, { JSZip, fetch, limit, reports })
+buildZip(entries, { JSZip, fetch, limit, reports, onProgress, delay })   // onProgress(done, total); delay injectable
+fetchBytes: retry loop, isRetryable(status | error)

 lib/progress.js  (new, pure)
+progressBadgeText(done, total) → '9/80' | '37%'
+overallPercent(phase, done, total)         // API 0–10 %, photos 10–100 %
+shouldReport(prevPercent, nextPercent)     // throttle: whole percent

 lib/clubmail.js  (new)
+fetchClubMailImages(partnerId)  → { origin, messages } | { failed: true }   // injected, self-contained
+clubMailConversationId(ownId, partnerId)   // higher ID first; duplicated inside the injected func (it can't import)
+toClubMailEntries(raw, owner, folder) → [{ url: absolute, name }]

 lib/profile.js
-toAlbumZipRequest(raw, date)
+toAlbumZipRequest(raw, date, clubMail)     → { zipName, entries, reports, clubMailFailed }
   reserves 'ClubMail' in `taken`, so an album titled "ClubMail" becomes ClubMail-2
   NothingToDownloadError only when albums and ClubMail are both empty

 background.js
+Promise.all([extract(fetchProfileAlbums), extract(fetchClubMailImages)])
+jobId per ZIP job, onMessage 'zip-progress' → badge
+warning tooltip combines causes: "3 of 80 photos missing; ClubMail unavailable"
```

Attachment URLs are absolute (`origin` from the fetcher), because the offscreen document fetches them from the extension origin. The host permission for `www.joyclub.de/.com` exists. Whether Chrome sends the session cookie on that request (`SameSite`) cannot be shown in E2E, so it is a manual check. Fallback if it fails: fetch the attachments inside the tab.

## Delivery

One commit per slice, each fully tested:

```text
1. Retries          lib/zip.js                     unit tests with a fake fetch and fake delay
2. Progress badge   lib/zip.js, offscreen.js,      unit (onProgress, throttle, badge text),
                    background.js                  integration (stubbed chrome), E2E badge
3. ClubMail         lib/clubmail.js, background.js unit (conversation ID order, paging, naming),
                                                   E2E with /clubmailv3/* routed in fixtures.js
```

Test data:

- ClubMail E2E fixtures are synthetic. Never commit real messages, names or user IDs from the mailbox (CLAUDE.md: `ref/` and `sandbox/` stay uncommitted).
- `routeJoyclubApi` in `tests/e2e/fixtures.js` gets routes for `get_latest_message_list_of_conversation` and `attachment/download`. Both are same-origin, so no CORS headers.
- The page fixtures need `data-session-user-id` and `data-cache-killer` on `<body>`.

Manual check (needs a real session): a click on a profile with a known conversation puts its attachments into `ClubMail/`, and the conversation stays unread.

Docs to update with the change: README (ZIP layout, badge progress, ClubMail), CLAUDE.md (ClubMail API, ID order, `cache_killer`, progress messages).
