# hidden-image-downloader

Many websites hide images behind a transparent GIF, so downloading the image just doesn't work. This browser extension (Chrome and Firefox) downloads all such protected images.

## Usage

Currently supports JoyClub (`www.joyclub.de`, `www.joyclub.com`) in Chrome only.

1. Load the extension unpacked via `chrome://extensions` (developer mode).
2. Open a photo in the JoyClub lightbox.
3. Click the toolbar icon. The image is saved to the default download folder as `<Owner>_<Title>_<YYYY-MM-DD_HHmmss>.<ext>`. A `.webp` image is saved as the site's `.jpg` version; if that is missing or does not answer within 5 s, the `.webp` is saved instead.

### Profile photos

On a profile page (`/profile/<id>.…`), its album overview (`/profile/fotos/…`) or one of its albums (`/profile/fotoalbum/…`), the click saves every photo of every album you can see as one ZIP, `<Owner>_<YYYY-MM-DD_HHmmss>.zip`. This applies even with a lightbox open there; use the lightbox on other pages for single photos.

- Each album gets its own folder, named after the album title. Duplicate names get `-2`, `-3`, …
- The main album folder takes the title of its card ("Fotos von uns" → `Fotos-von-uns`). On an album page there is no such card, so the click waits about 3 s and names the folder `Hauptalbum`; the same happens if the card title cannot be read.
- Photos are named `<Album>/<Owner>_<Album>_<nn>_<photo-id>.jpg`, numbered per album in the site's order (`001` once an album has 100 or more photos). `<photo-id>` is the first 8 characters of the photo's ID.
- The attachments of your ClubMail conversation with that profile, from both sides and of every file type, go into a `ClubMail/` folder: `ClubMail/<Owner>_ClubMail_<nn>_<attachment-id>.<ext>`, oldest first. An album titled "ClubMail" gets the folder `ClubMail-2`. `ClubMail/conversation.md` holds the whole conversation as Markdown: one heading per day, `**<Author>** · HH:MM` per message (local time), a `> Reply to <author>, <time>: <snippet>` line for replies, smileys as their text, links (including album links) only if they are `http(s)`, and the attachments as relative links (images inline). `ClubMail/conversation.html` shows the same conversation as a web page with the images inline, your messages as bubbles on the right and the others on the left; it opens offline, loads nothing from the internet, and shows message text as text, so markup typed by the other user does not run. Reading the conversation does not mark it as read. Without a conversation there is no `ClubMail/` folder.
- Albums that need the owner's permission are skipped and listed in `skipped.txt` with their photo count. Empty albums are left out.
- While the ZIP is built, a blue badge shows the progress: `0%` → `5%` → `10%` while the album list and the ClubMail conversation load, then the photo count while it fits (`9/80`), otherwise the overall percentage (`37%`). The tooltip says "n of m photos". The badge clears when the ZIP is saved, or turns amber or red as described below.
- A photo fetch that fails with a network error, timeout, HTTP 429 or 5xx is retried twice (after 1 s and 2 s). Photos that still fail, or answer with another error, are listed in `missing.txt`, and the icon shows an amber `!` badge with the tooltip "n of m photos missing". If no photo loads, no ZIP is saved and the badge says "download failed". If every album is restricted or empty and there are no ClubMail attachments, the badge says "no lightbox image or profile photos found".
- If the ClubMail conversation cannot be read, the album ZIP is still saved, `skipped.txt` gets the line `ClubMail: unavailable`, and the badge turns amber with the tooltip "ClubMail unavailable" (after "n of m photos missing; " if photos are missing too).

### ClubMail conversation

On an open ClubMail conversation (`/clubmail/conversation/conversation-wrapper-personal-<id>-<id>/`), the click saves only that conversation as `<Partner>_ClubMail_<YYYY-MM-DD_HHmmss>.zip`: the `ClubMail/` folder with the attachments, `conversation.md` and `conversation.html`, as described above. It skips the album list. The badge shows `0%` → `10%` while the conversation loads, then the attachment count. If the conversation cannot be read, nothing is saved and the badge turns red with the tooltip "ClubMail unavailable"; an empty conversation shows "no lightbox image or profile photos found". A conversation without attachments gives a ZIP with only the two transcripts. The conversation is not marked as read.

You need to be logged in on the domain you are browsing (`joyclub.de` or `joyclub.com`): the extension reads the album list and the ClubMail conversation through JoyClub's own API with that session. If the album list cannot be read, the badge says "album list unavailable".

### Errors

If nothing can be downloaded (other site, neither a lightbox nor profile photos, album list unavailable, ClubMail unavailable on a conversation page, no image address, download failed), the icon shows a red `!` badge and its tooltip names the reason. The badge only reports failures before the download starts; later network errors show up in Chrome's download list only.

## Development

```sh
npm install        # also activates the pre-commit hook
npm test           # lint + unit + integration tests (runs on every commit and in CI)
npm run test:e2e   # Playwright E2E, headed Chrome with the extension loaded
```

Manual checks (they need a real JoyClub session, which the tests cannot have):

- Click on a real conversation with replies, smileys and links. Open `conversation.html` offline: the images show, replies are quoted, smileys are text, links work.
- Export an unread conversation: it stays unread in JoyClub.
- The ZIP on disk has the requested name (Playwright saves downloads under GUID names).

`vendor/jszip.min.js` is JSZip from npm, pinned in `package.json`. To update it, bump the version, run `npm install`, then `cp node_modules/jszip/dist/jszip.min.js vendor/jszip.min.js` and restore its two header lines. `tests/unit/vendor-jszip.test.js` checks that the copy matches.
