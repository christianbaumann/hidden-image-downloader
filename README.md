# hidden-image-downloader

JoyClub hides its images behind a transparent GIF, so the browser's "Save image" saves the GIF instead of the image. This Chrome extension downloads the real images.

It runs in Chrome only and on JoyClub only (`www.joyclub.de`, `www.joyclub.com`). Other browsers and sites are not supported yet; Firefox lacks `chrome.offscreen`, which the profile ZIP needs.

## Usage

1. Load the extension unpacked via `chrome://extensions` (developer mode).
2. Open a photo in the JoyClub lightbox.
3. Click the toolbar icon. The image is saved to the default download folder as `<Owner>_<photo-id>.<ext>`, with `<photo-id>` as in the profile ZIP (first 8 characters of the photo's ID, else JoyClub's photo number). When album title and position are known, the name is `<Owner>_<Album>_<nn>_<photo-id>.<ext>`, the same as the photo's name in the profile ZIP. A repeat download gets Chrome's usual ` (1)`. A smaller or cropped image is saved as the photo's full-size `.jpg` when JoyClub has one. A `.webp` image is saved as the site's `.jpg` version; if that is missing or does not answer within 5 s, the `.webp` is saved instead.

### Context menu: "Save hidden image"

Right-click any image on a JoyClub page (album grid, profile cards, lightbox, feed, photo detail) and choose "Save hidden image". It saves the image below the transparent overlay, not the overlay GIF: the first element under the pointer with a background image, else the widest entry of a `srcset`, else the address of a plain image that is no GIF. It works inside JoyClub iframes too. On feed member cards the name starts with the card's user name. A smaller or cropped version (feed, cards) is saved as the photo's full-size `.jpg` when JoyClub has one; photos behind JoyClub's FSK18 activation stay at the size the page shows. A right-click on a dark backdrop, such as beside the lightbox photo, finds no image instead of saving a photo hidden behind it. The name follows the rules above. On an album page (`/profile/fotoalbum/…`) the name includes album title and position, `<Owner>_<Album>_<nn>_<photo-id>.<ext>`, the same as in the profile ZIP. The menu shows only on JoyClub pages. In a tab that was open before the extension was installed or reloaded, the badge says "reload the page and try again".

### Profile photos

On a profile page (`/profile/<id>.…`), its album overview (`/profile/fotos/…`) or one of its albums (`/profile/fotoalbum/…`), the click saves every photo of every album you can see as one ZIP, `<Owner>.zip`. Everything in the ZIP sits in one top folder named like the ZIP (`<Owner>/`), so it extracts into that folder with every unzip tool. A later click saves only what is new (see "Only new files"), as `<Owner> (1).zip` and so on. This applies even with a lightbox open there; use the lightbox on other pages for single photos.

- Each album gets its own folder, named after the album title. Duplicate names get `-2`, `-3`, …
- The main album folder takes the title of its card ("Fotos von uns" → `Fotos-von-uns`). On an album page there is no such card, so the click waits about 3 s and names the folder `Hauptalbum`; the same happens if the card title cannot be read.
- Photos are named `<Album>/<Owner>_<Album>_<nn>_<photo-id>.jpg`, numbered by their position in the album, in the site's order (`001` once an album has 100 or more photos). A photo that cannot be loaded leaves a gap in the numbers, so every photo keeps the number it has on the album page. `<photo-id>` is the first 8 characters of the photo's ID.
- The attachments of your ClubMail conversation with that profile, from both sides and of every file type, go into a `ClubMail/` folder: `ClubMail/<Owner>_ClubMail_<nn>_<attachment-id>.<ext>`, oldest first. The ones you sent yourself go into `ClubMail/Own/<Your name>_ClubMail_<nn>_<attachment-id>.<ext>` (`unknown` if your messages carry no name), numbered on their own. An album titled "ClubMail" gets the folder `ClubMail-2`. `ClubMail/conversation.md` holds the whole conversation as Markdown: one heading per day, `**<Author>** · HH:MM` per message (local time), a `> Reply to <author>, <time>: <snippet>` line for replies, smileys as their text, links (including album links) only if they are `http(s)`, and the attachments as relative links (images inline). `ClubMail/conversation.html` shows the same conversation as a web page with the images inline, your messages as bubbles on the right and the others on the left; it opens offline, loads nothing from the internet, and shows message text as text, so markup typed by the other user does not run. Reading the conversation does not mark it as read. Without a conversation there is no `ClubMail/` folder.
- `profile.md` and `profile.html` at the top of the ZIP hold the profile text (motto, "About", likes, dislikes; empty parts left out), then one section per saved album with its description and every photo as a relative link to its file, with the photo's title (JoyClub's placeholders `...` and `Profilbild` left out), description and hashtags. JoyClub's `[b]`, `[i]` and `[p]` become bold, italic and paragraphs; smiley codes like `*kuss*` stay as text. `profile.html` shows the photos inline, opens offline, loads nothing from the internet, and shows the text as text, so markup typed into the profile does not run. A photo that ends up in `missing.txt` is still listed, with a link that leads nowhere. If the profile text or the captions cannot be read, their parts are left out and the ZIP is saved as usual. "Steckbrief" and "Vorlieben" are not included. The ClubMail-only ZIP has no profile files.
- The profile's videos go into a `Videos/` folder as `Videos/<Owner>_Videos_<nn>_<video-id>.mp4`, numbered in JoyClub's order (newest first). JoyClub streams them as HLS; the extension fetches the highest quality and converts it to mp4 (with mux.js). A video without a stream leaves a gap in the numbers and a line in `skipped.txt`: `Videos: <n> not available (FSK18 locked)` when JoyClub's FSK18 activation is off (JoyClub then sends no stream; the extension does not get around that), else `Videos: <n> not available`. An encrypted stream is not saved and gets `Videos: <n> not supported (encrypted)`. If the video list cannot be read, the photos are saved as usual and `skipped.txt` says `Videos: unavailable (<reason>)`. An album titled "Videos" gets the folder `Videos-2`. A long video can take a while and needs memory for its full size: a 9-minute video is fetched in about 130 parts. The extension never registers a view.
- Restricted albums are skipped and listed in `skipped.txt` with their photo count and JoyClub's reason (if given), e.g. `Lady (9 photos): NEEDS_PERMISSION_BY_OWNER`. Known reasons: `NEEDS_PERMISSION_BY_OWNER`, `INSUFFICIENT_MEMBERSHIP`, `NEEDS_VERIFICATION`. Empty albums are left out.
- While the ZIP is built, a blue badge shows the progress: `0%` → `3%` → `6%` → `10%` while the album list, the video list and the ClubMail conversation load, then the file count (each video counts as one) while it fits (`9/80`), otherwise the overall percentage (`37%`). The tooltip says "n of m photos". The badge clears when the ZIP is saved, or turns amber or red as described below.
- A photo fetch that fails with a network error, timeout, HTTP 429 or 5xx is retried twice (after 1 s and 2 s); for a video, each playlist and part is. Photos and videos that still fail, or answer with another error, are listed in `missing.txt`, and the icon shows an amber `!` badge with the tooltip "n of m photos missing". If no photo loads, no ZIP is saved and the badge says "download failed". If every album is restricted or empty and there are no ClubMail attachments, the badge says "no lightbox image or profile photos found".
- If the ClubMail conversation cannot be read, the album ZIP is still saved, `skipped.txt` gets the line `ClubMail: unavailable (<reason>)`, and the badge turns amber with the tooltip "ClubMail unavailable (<reason>)" (after "n of m photos missing; " if photos are missing too). The reason is one of `no session` (not logged in), `not your conversation`, `HTTP <status>`, `bad response`, `timeout`, `network error`, or `extension could not run on the page`.

### ClubMail conversation

On an open ClubMail conversation (`/clubmail/conversation/conversation-wrapper-personal-<id>-<id>/`), the click saves only that conversation as `<Partner>_ClubMail.zip`: inside the top folder `<Partner>_ClubMail/`, the `ClubMail/` folder with the attachments, `conversation.md` and `conversation.html`, as described above. It skips the album list. The badge shows `0%` → `10%` while the conversation loads, then the attachment count. If the conversation cannot be read, nothing is saved and the badge turns red with the tooltip "ClubMail unavailable (<reason>)", with the reasons listed above; an empty conversation shows "no lightbox image or profile photos found". A conversation without attachments gives a ZIP with only the two transcripts. The conversation is not marked as read.

### Only new files

The extension remembers which photos, videos and ClubMail attachments it saved, plus a fingerprint of the profile text, per JoyClub user (the profile owner, or the conversation partner). A later click on that profile or conversation zips only the files not saved before, under the names and numbers they have in the full ZIP, so numbers have gaps. `skipped.txt`, the transcripts and the profile files are always complete; the profile files link to earlier photos under their full-ZIP names. If there are no new files but new messages or a changed profile text, the ZIP holds only the transcripts, the profile files and `skipped.txt`. Changed photo captions or album descriptions alone do not count as new; the first click after updating to a version with profile files gives one such ZIP, since no fingerprint is saved yet. If there is nothing new at all, nothing is saved and the badge shows a grey `✓` with the tooltip "nothing new" (amber, with the ClubMail reason and the log as its own download, if the ClubMail conversation could not be read).

A file counts as saved once its ZIP download is complete in Chrome. An interrupted or cancelled download and files listed in `missing.txt` are not recorded (an encrypted video counts as saved, so it does not come back on every click), so the next click saves them again. The record lives in the Chrome profile (`chrome.storage.local`) and survives a cleared download history; removing the extension deletes it.

To save everything again, right-click the toolbar icon and choose "Download everything again". It saves the full ZIP and keeps the record.

You need to be logged in on the domain you are browsing (`joyclub.de` or `joyclub.com`): the extension reads the album list and the ClubMail conversation through JoyClub's own API with that session. If the album list cannot be read, the badge says "album list unavailable".

### Errors

If nothing can be downloaded (other site, neither a lightbox nor profile photos, album list unavailable, ClubMail unavailable on a conversation page, no image address (also: no image below the right-click), page not ready for the context menu, download failed), the icon shows a red `!` badge and its tooltip names the reason. The badge only reports failures before the download starts; later network errors show up in Chrome's download list only.

A red badge also saves `hidden-image-downloader-log.txt` to the download folder, as does an unexpected error. It lists the steps of the click (page type, album list and ClubMail results, `.jpg` probe status, download) with the time since the click and the reason it failed. It holds no tokens, cookies or message text, and URLs without their query. An amber badge writes the same log as `log.txt` into the ZIP, next to `missing.txt` and `skipped.txt`, including every failed or retried photo fetch with its file name in the ZIP and its HTTP status or error. A click that succeeds saves no log.

## Development

```sh
npm install        # also activates the pre-commit hook
npm test           # lint + unit + integration tests (runs on every commit and in CI)
npm run test:e2e   # Playwright E2E, headed Chrome with the extension loaded
```

Manual checks (they need a real JoyClub session, which the tests cannot have):

- Click on a real conversation with replies, smileys and links. Open `conversation.html` offline: the images show, replies are quoted, smileys are text, links work.
- Export an unread conversation: it stays unread in JoyClub.
- Export a profile with videos: the mp4 files in `Videos/` play in QuickTime and VLC with sound, full length.
- The ZIP on disk has the requested name (Playwright saves downloads under GUID names).
- "Download everything again" shows when right-clicking the toolbar icon, and "Save hidden image" does not (Playwright cannot open either menu; the tests call the handler).
- "Save hidden image" shows in Chrome's context menu on JoyClub pages and not on other sites, and saves the right image on a real album page, profile, feed and photo detail page (Playwright cannot open Chrome's context menu; the tests call its handler).

`vendor/jszip.min.js` is JSZip from npm, pinned in `package.json`. To update it, bump the version, run `npm install`, then `cp node_modules/jszip/dist/jszip.min.js vendor/jszip.min.js` and restore its two header lines. `tests/unit/vendor-jszip.test.js` checks that the copy matches. `vendor/mux.min.js` (mux.js, converts the video streams) is vendored the same way from `node_modules/mux.js/dist/mux.min.js`; `tests/unit/vendor-muxjs.test.js` checks it.
