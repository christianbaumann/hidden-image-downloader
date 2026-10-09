---
id: 06
dependencies: []
---

# Task 06: Incremental profile and conversation ZIP

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

* [ ] `manifest.json`: `storage` permission (`contextMenus` too, if task 05 is not done yet)
* [ ] Pure function in `lib/`: filter a ZIP request against a saved record (`photos`, `attachments`, `lastMessageId`) → filtered request, the keys to record, and a "nothing new" result; entry names and `nn` stay unchanged; reports stay complete
* [ ] ZIP requests expose the photo key and attachment id of each entry and the newest message id
* [ ] `handleActionClick(tab, { full })`: read `saved:<userId>` from `storage.local` (skip when `full`), filter, store `pending:<downloadId>` in `storage.session`
* [ ] `onDownloadChanged`: `complete` → merge pending into `saved:<userId>`; `interrupted` → drop pending
* [ ] Nothing new → no ZIP, neutral badge "nothing new"
* [ ] Action context menu "Download everything again" (`contexts: ['action']`) calls `handleActionClick` with `full: true`
* [ ] Unit tests for the filter (first run, partial, nothing new, new message only, `nn` kept); integration tests for pending → saved on `complete`, dropped on `interrupted`, survival via `storage.session`
* [ ] E2E: second click on the same fixture profile gives "nothing new"; menu click gives the full ZIP
* [ ] README and `CLAUDE.md` describe incremental export and the menu entry

## Verification

* [ ] First click on a profile → full ZIP; second click without changes → no download, badge "nothing new"
* [ ] One new photo in the fixture → ZIP with only that photo under its full-ZIP name, plus complete transcripts and `skipped.txt`
* [ ] A new message without attachment → ZIP with transcripts only
* [ ] An interrupted ZIP download is not recorded; the next click saves those files again
* [ ] "Download everything again" saves the full ZIP and keeps the record
* [ ] `npm test` and `npm run test:e2e` pass
