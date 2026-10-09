---
id: 06
dependencies: []
---

# Task 06: Incremental profile and conversation ZIP

**Status:** Done and approved by the user (2026-10-09). Commits `dd05e08`, `685439a`, `fed2e98`.

A click on a profile or conversation saves only the photos and attachments not saved before; "Download everything again" in the action context menu saves the full ZIP.

## References

* `design.md#f-incremental-export`
* `design.md#toolbar-click-saves-only-new-files`
* `design.md#saved-files-are-kept-in-chromestoragelocal`
* `design.md#incremental-zip-keeps-names-and-numbers`
* `design.md#nothing-new-means-no-zip`
* `background.js` (`handleActionClick`, `downloadZip`, `onDownloadChanged`)
* `lib/profile.js` (`toAlbumZipRequest`, `toClubMailZipRequest`, `photoKey`), `lib/clubmail.js` (`toClubMailConversation`)

## Work

* [x] `manifest.json`: `storage` permission (`contextMenus` too, if task 05 is not done yet)
* [x] Pure function in `lib/`: filter a ZIP request against a saved record (`photos`, `attachments`, `lastMessageId`) → filtered request, the keys to record, and a "nothing new" result; entry names and `nn` stay unchanged; reports stay complete
* [x] ZIP requests expose the photo key and attachment id of each entry and the newest message id
* [x] `handleActionClick(tab, { full })`: read `saved:<userId>` from `storage.local` (skip when `full`), filter, store `pending:<downloadId>` in `storage.session`
* [x] `onDownloadChanged`: `complete` → merge pending into `saved:<userId>`; `interrupted` → drop pending
* [x] Nothing new → no ZIP, neutral badge "nothing new"
* [x] Action context menu "Download everything again" (`contexts: ['action']`) calls `handleActionClick` with `full: true`
* [x] Unit tests for the filter (first run, partial, nothing new, new message only, `nn` kept); integration tests for pending → saved on `complete`, dropped on `interrupted`, survival via `storage.session`
* [x] E2E: second click on the same fixture profile gives "nothing new"; menu click gives the full ZIP
* [x] README and `CLAUDE.md` describe incremental export and the menu entry

## Verification

* [x] First click on a profile → full ZIP; second click without changes → no download, badge "nothing new" **Note:** Verified via integration `incremental export` › "a second click without changes …" and E2E "a second click saves nothing new; …"
* [x] One new photo in the fixture → ZIP with only that photo under its full-ZIP name, plus complete transcripts and `skipped.txt` **Note:** Verified via integration "a new photo is zipped alone under its full-ZIP name, with complete reports" and unit `filterNewEntries` (partial, reports complete)
* [x] A new message without attachment → ZIP with transcripts only **Note:** Verified via integration "a new message without attachment zips the transcripts only"
* [x] An interrupted ZIP download is not recorded; the next click saves those files again **Note:** Verified via integration "an interrupted download is not recorded, …"
* [x] "Download everything again" saves the full ZIP and keeps the record **Note:** Verified via integration and E2E (handler called from the service worker; the menu's visibility on the toolbar icon is a manual check, see README)
* [x] `npm test` and `npm run test:e2e` pass **Note:** 539 unit/integration, 22 E2E

## Implementation notes

* Record keys: album entries carry `photoKey`, ClubMail entries `attachmentId`, requests `lastMessageId` (`lib/incremental.js`: `filterNewEntries`, `savedRecord`, `mergeRecord`).
* Photos listed in `missing.txt` are not recorded (not in the design; otherwise a failed photo would never be retried).
* Nothing new while ClubMail failed: amber badge "nothing new; ClubMail unavailable (<reason>)" and the log as its own download, since there is no ZIP for `log.txt` (the design only covers the clean case).
* Neutral badge: grey `#5f6368`, text `✓`, tooltip "nothing new".
* The action menu has no `documentUrlPatterns`; on a non-profile page it behaves like a toolbar click.
* An entry without a key (photo URL without UUID) cannot be recorded and always counts as new, so such a profile never reaches "nothing new". Production photo URLs carry a UUID.
* "New messages" means the newest message id differs from the saved one, and the finishing download's id wins. A late older ZIP or a deleted newest message therefore costs one extra transcripts-only ZIP.
* A failing `pending:` write is logged; the ZIP stays a success, its files just stay unrecorded.
* Review fix (boy scout, from task 05): "Save hidden image" used `contexts: ['all']`, which also covers the toolbar icon's menu; it now lists every page context.

## Live check (2026-10-09)

With the user's session (playwright-cli, extension loaded, a profile with 1 photo and 10 own ClubMail attachments):

* First click → full ZIP (11 files); after `complete` `saved:<id>` holds 1 photo, 10 attachments, `lastMessageId`; no `pending:` left.
* Second click → no download, badge `✓` "nothing new".
* `lastMessageId` set back (stands in for a new message; no real message was sent) → ZIP with only `ClubMail/conversation.md` and `.html`; the next click gives "nothing new" again.
* "Download everything again" (`handleMenuClick`) → full ZIP, record unchanged; the next click gives "nothing new".
* ZIP download cancelled in `downloads.onCreated` → `interrupted` (`USER_CANCELED`), nothing recorded, the next click saves all 11 files again.
* Toolbar icon menu: checked by the user ("Download everything again" present, "Save hidden image" absent).

**Approved** by the user on 2026-10-09.
