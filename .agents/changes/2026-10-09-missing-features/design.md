---
datetime: 2026-10-09T14:24:22+02:00
author: Christian Baumann
tags: [readme, failure-log, context-menu, incremental, profile-text, videos]
---

# Missing features: log, context menu, incremental export, profile text, videos

Six additions, chosen in a brainstorm on 2026-10-09:

| Id | Feature | Short |
|---|---|---|
| O | README | State the real scope: Chrome only, JoyClub only |
| M | Failure log | A log file when a click fails or warns |
| C | Context menu | "Save hidden image" on any JoyClub image, not only the lightbox |
| F | Incremental export | A profile or conversation click saves only files not saved before |
| H | Profile text | `profile.md` and `profile.html` with profile text, album descriptions, photo captions and hashtags |
| J | Videos | Profile videos in the profile ZIP, if JoyClub serves them as files |

Sources:

- Current behaviour: [`README.md`](../../../README.md), [`CLAUDE.md`](../../../CLAUDE.md) (click dispatch, album path, ClubMail path, offscreen ZIP)
- Failure log pattern: `/Users/christian.baumann/git_repos/_own/jira-ticket-exporter` (README "Diagnostics")
- Earlier research on photo titles and the "Videos" slider: [`docs/agents/research/2026-10-08-jc-profile-slider-zip-download.md`](../../../docs/agents/research/2026-10-08-jc-profile-slider-zip-download.md), [`docs/agents/plans/2026-10-08-profile-albums-zip.md`](../../../docs/agents/plans/2026-10-08-profile-albums-zip.md) ("No videos, no hashtags, no per-photo titles or descriptions")

## Order of slices

Each slice is tested end to end and committed before the next one starts. H and J start with a live research spike. If the spike shows the feature is not possible, the slice ends with a note in this change and in `.agents/backlog.md`.

```text
O+M ──> C ──> F ──> H spike ──> H ──> J spike ──> J (or: out of scope)
```

## Entry points after the change

The extension gets two new entry points: a page context menu (C) and an action context menu (F). The toolbar click keeps its URL dispatch.

```text
toolbar click            handleActionClick(tab)                    background.js
├── conversation URL     ClubMail-only ZIP, only new files    (F)
├── profile URL          album ZIP + ClubMail, only new files (F), + profile.md/.html (H), + Videos/ (J)
└── other URL            lightbox image, new filename scheme  (C)

page context menu        "Save hidden image"                  (C)  JoyClub pages only
└── content script target → image under the overlay → single download

action context menu      "Download everything again"          (F)  profile and conversation URLs
└── handleActionClick with full = true
```

New permissions: `contextMenus`, `storage`. New manifest entry: `content_scripts` for `https://www.joyclub.de/*` and `https://www.joyclub.com/*`.

## O: README

The README says "Chrome and Firefox" and "many websites". The extension runs in Chrome only (no `chrome.offscreen` in Firefox) and on JoyClub only. The first commit changes these claims. Later slices update the README with their behaviour.

## M: Failure log

Every click collects log lines in memory: step, HTTP status, reason, duration. The offscreen document collects its own lines (fetch failures, retries) and returns them in the `build-zip` answer.

```text
click outcome            log goes to
─────────────────────    ──────────────────────────────────────────
saved, no warning        nowhere (log is dropped)
amber badge              <top folder>/log.txt inside the ZIP
red badge                hidden-image-downloader-log.txt (own download)
unexpected exception     hidden-image-downloader-log.txt (own download)
```

Log lines never hold tokens, cookies or message text. URLs are written without the query string.

## C: Context menu

Chrome gives the context menu click only `srcUrl`. On JoyClub that is the transparent overlay GIF. A content script therefore stores the element under the last right-click, and the menu click asks it for the real image.

```text
contextmenu event        content script (JoyClub pages)
└── store clientX/Y
menu click               background.js
└── tabs.sendMessage → content script
    └── elementsFromPoint(x, y)
        └── first of: img.secure_image | background-image | srcset   (below the overlay)
    → { url, owner, album, position, photoId }
→ widest jpg, .webp → .jpg probe (existing firstAvailable)
→ startDownload with the new filename
```

Filename for both single-image paths (context menu and toolbar lightbox):

```text
album and position known    <Owner>_<Album>_<nn>_<photo-id>.jpg     same as in the profile ZIP
otherwise                   <Owner>_<photo-id>.jpg
```

No timestamp. Chrome uniquifies repeats, as with the ZIPs. Which pages give album and position is part of the C slice research.

## F: Incremental export

The extension remembers which files it saved, per JoyClub user id (the profile owner, or the conversation partner). The next click on that profile or conversation zips only the files not in that record.

```text
storage.local   saved:<userId> = { photos: [photoKey], attachments: [attachId], lastMessageId }
storage.session pending:<downloadId> = { userId, photos, attachments, lastMessageId }

click     filter entries against saved:<userId> → ZIP → store pending:<downloadId>
onChanged state 'complete'    → merge pending into saved:<userId>, drop pending
          state 'interrupted' → drop pending
```

`pending` sits in `storage.session`, so it survives a service worker restart between the start and the end of the download.

```text
new files   new messages   result
─────────   ────────────   ─────────────────────────────────────────────
yes         any            ZIP with new files + full transcripts + skipped.txt
no          yes            ZIP with full transcripts + skipped.txt only
no          no             no ZIP, neutral badge "nothing new"
```

## H: Profile text and captions

Spike first, with the user's live session (playwright-cli + cookies, see `CLAUDE.md`):

- profile page DOM: which text sections exist ("Über mich" and similar)
- GraphQL fields for album description and photo caption, read from JoyClub's frontend bundle (introspection is off; the restriction enums came from there too)

Planned output, profile ZIP only:

Answers of 2026-10-09 (after research 07):

- Profile text converted to Markdown (bold, italic, paragraphs; smiley codes as escaped text), plus an HTML version styled like `conversation.html`.
- Every saved photo is listed with its file link; only real titles are shown (not `...`/`Profilbild`), plus description and hashtags when present.
- An incremental ZIP holds the complete `profile.md`/`.html`, like the transcripts; links to photos saved earlier point to their full-ZIP names.
- A changed profile text counts as new: the saved record keeps a fingerprint of it, and a change alone gives a ZIP with the profile files (plus transcripts and `skipped.txt`).
- "Steckbrief" and "Vorlieben" stay out (enum keys only; backlog).

```text
<Owner>/
├── profile.md          NEW  profile text, then one section per album:
│                            description, photo list (caption, hashtags → relative file link)
├── profile.html        NEW  the same as a web page, like conversation.html
├── <Album>/…
├── ClubMail/…
└── skipped.txt
```

## J: Videos

Spike first, same setup: does any profile have videos, and how does JoyClub serve them?

```text
spike result     action
─────────────    ──────────────────────────────────────────────────────────
mp4 file         Videos/<Owner>_Videos_<nn>_<id>.mp4 in the profile ZIP,
                 same fetchBytes retries, counted in the progress badge
HLS or DRM       not downloaded; "Videos: <n> not supported (<format>)" in skipped.txt
no videos found  slice ends, backlog note
```

Spike result (task 09, [`research-09-profile-videos.md`](research-09-profile-videos.md)): every profile video is unencrypted HLS VOD (MPEG-TS, H.264/AAC), no mp4. User decision 2026-10-09: download them anyway.

```text
video kind            action
──────────────────    ──────────────────────────────────────────────────────────
unencrypted HLS VOD   highest rendition's segments → remux to mp4 (vendored mux.js)
                      → Videos/<Owner>_Videos_<nn>_<id>.mp4, counted in the progress badge
encrypted / DRM       not downloaded; "Videos: <n> not supported (<format>)" in skipped.txt
no source             (locked FSK18 session) "Videos: <n> not available (FSK18 locked)" in skipped.txt
```

Follow-up checks done (2026-10-10): a second profile has the same format; a locked FSK18 session gets no playlist URL, so those videos go to `skipped.txt` (no bypass). Still to design: where segments are fetched (tab vs. offscreen with the per-video CloudFront cookies) and where the remux runs.

ClubMail video attachments are not affected. They already land in `ClubMail/` as files.

## Key Decisions

### One design for all six features

- **Decision:** One change folder, one design, one task per slice.
- **Reason:** The features share the manifest, `handleActionClick` and the README. One design shows how they fit together.
- **Trade-offs:** Rejected: six change folders (more overhead, the shared parts would be spread across them); two changes split by code area.

### README states the real scope

- **Decision:** Say "Chrome only, JoyClub only" until other browsers or sites work.
- **Reason:** The README promises Firefox and "many websites", and neither works.
- **Trade-offs:** None.

### Failure log only on warnings and errors

- **Decision:** Amber: `log.txt` in the ZIP. Red or unexpected exception: separate `hidden-image-downloader-log.txt`. Clean runs write nothing.
- **Reason:** Pattern from jira-ticket-exporter. A clean run needs no diagnostics. With amber the ZIP already exists, so the log goes where `missing.txt` and `skipped.txt` are.
- **Trade-offs:** Rejected: log on every click (clutter); a log tab like jira (one more page to close); a separate file for amber as well.

### Log without secrets or content

- **Decision:** No tokens, cookies or message text; URLs without the query string.
- **Reason:** The log is meant to be shared for debugging. ClubMail attachment URLs carry ids in the query.
- **Trade-offs:** Some request details are missing from the log.

### Content script finds the right-clicked image

- **Decision:** A content script on JoyClub stores the last `contextmenu` position. The menu click reads `elementsFromPoint` and takes the first real image below the overlay.
- **Reason:** `srcUrl` is the overlay GIF. Images in `background-image` have no `image` context at all.
- **Trade-offs:** One more script runs on every JoyClub page. Rejected: menu only for the `image` context with a lookup near `srcUrl` (misses `background-image`); the menu only reusing the lightbox path (works only with a lightbox open).

### One filename scheme for single images and ZIP entries

- **Decision:** `<Owner>_<Album>_<nn>_<photo-id>.jpg`, else `<Owner>_<photo-id>.jpg`. The toolbar lightbox switches from `<Owner>_<Title>_<ts>` to this scheme too.
- **Reason:** A photo saved by itself has the same name as in the ZIP. That makes duplicates easy to see and matches the incremental record (photo key).
- **Trade-offs:** The photo title leaves the single-image name. Rejected: keeping the old scheme for the toolbar (two schemes); always `<Owner>_<photo-id>.jpg` (loses the album).

### Toolbar click saves only new files

- **Decision:** Profile and conversation clicks save only files not saved before. The first click saves everything. "Download everything again" in the action context menu forces a full ZIP.
- **Reason:** The main use is archiving the same profiles again and again.
- **Trade-offs:** This changes the current default. A user who deleted an old ZIP must use the menu entry. Rejected: full by default with "only new" in the menu; incremental only, with no way to get a full ZIP.

### Saved files are kept in `chrome.storage.local`

- **Decision:** `saved:<userId>` in `storage.local`, merged only when the download reports `complete`. The record waits as `pending:<downloadId>` in `storage.session` until then.
- **Reason:** It works without a popup, survives a cleared download history, and does not record a ZIP that never arrived.
- **Trade-offs:** The record lives in one Chrome profile; another browser starts from zero. Rejected: Chrome's download history (`downloads.search`, gone once cleared); comparing with an old ZIP the user picks (needs a popup).

### Incremental ZIP keeps names and numbers

- **Decision:** `nn` stays the photo's position in its album. The ZIP name stays `<Owner>.zip` (Chrome adds ` (1)`). Transcripts and `skipped.txt` are always complete.
- **Reason:** New files get the names they would have in a full ZIP, so the two can be merged by hand.
- **Trade-offs:** Numbers in an incremental ZIP have gaps. Rejected: numbering only the new files; `_new` or a date in the ZIP name; partial transcripts.

### Nothing new means no ZIP

- **Decision:** No new files and no new message: no ZIP, neutral badge "nothing new". New messages without new files: ZIP with transcripts only.
- **Reason:** An empty ZIP is noise. A new message is new content.
- **Trade-offs:** Needs `lastMessageId` in the record.

### Live spikes before H and J

- **Decision:** One research spike each with the user's session before the H and J details are designed.
- **Reason:** The API has no introspection. Earlier research saw no captions in the API and only a "Neues Video" button in the videos slider. Designs built on guesses have failed here before (main album title).
- **Trade-offs:** The spikes need the user's cookies and time. Either slice may end as "not possible".

### `profile.md` in the profile ZIP only

- **Decision:** `profile.md` and `profile.html` at the ZIP root, profile ZIP only.
- **Reason:** The ClubMail-only ZIP is about the conversation, not the profile. The HTML version matches `conversation.html` (user decision 2026-10-09, replacing the earlier "Markdown only").
- **Trade-offs:** One more renderer to test; it follows the transcript pattern (escape every value, nothing remote).

### Videos as mp4, also from HLS

- **Decision (2026-10-09, after task 09):** profile videos go into `Videos/` as mp4. JoyClub serves only unencrypted HLS, so the extension fetches the highest rendition's segments and remuxes them to mp4 with a vendored `mux.js`. Encrypted or DRM streams are listed in `skipped.txt`.
- **Reason:** No profile video is a plain file; the original rule ("HLS goes to `skipped.txt`") would have kept every video out of the archive.
- **Trade-offs:** A new vendored runtime dependency and a remux step with its own failure modes; only the highest rendition is kept.
- **Superseded:** "Videos only as plain files" (HLS streams listed in `skipped.txt`).

## Open questions (answered by the slices)

- C: Which JoyClub pages give album and position for a single image?
- H: Which profile text sections and caption fields exist?
- J: Do profile videos exist, and in which format?
