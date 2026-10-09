---
id: 11
dependencies:
- 05
---

# Task 11: Close the context menu gaps

Close the known limitations of the "Save hidden image" menu found in the task 05 review and live check.

## References

* `tasks/05-save-hidden-image-context-menu.md` (sections "Live check" and "Review")
* `content.js`, `lib/hidden-image.js`, `lib/profile.js` (`albumEntries`), `manifest.json`
* `tests/e2e/fixtures/album.html`, `tests/e2e/download.spec.js`

## Work

* [x] Album numbering: `albumEntries` numbers each photo by its position in `userImageIdList` (a photo without source leaves a gap, the width follows the list length), so it matches the menu's `a.album-link` position
* [x] Iframes: `content.js` runs in every JoyClub frame (`all_frames: true`), so a menu click in a JoyClub iframe gets an answer
* [x] A failing `describeImageLayers` answers `null` (→ "image address not found") instead of closing the port (→ "reload the page and try again")
* [x] Plain images: an `img` whose own `src` is an http(s) URL other than a GIF counts as an image layer when it has no background image or `srcset`; the overlay GIF (data URI or `.gif`) never does
* [x] Owner on feed member cards: the layer owner falls back to the closest `[user-name]` attribute (`j-member-card`)
* [x] E2E fixture with live-like markup: `<picture>` sources below an `img.img-pane` data-URI GIF inside a `j-member-card[user-name]` (covers `srcsetOf` and the owner fallback against a real DOM)
* [x] Unit tests for the numbering, the plain-image rule and the owner fallback; manifest test for `all_frames`
* [x] README and `CLAUDE.md` updated

Not in scope (decision pending, see summary): upgrading feed crops (`…/1-1/image_720_<token>`, `…/orig/image_180_<token>`) to `…/orig/image_1920_<token>`. Some feed photos sit behind JoyClub's FSK18 activation (`/webauth/activate/fsk18/`); the upgrade would bypass that gate.

## Verification

* [x] A profile ZIP with a photo without source numbers the later photos by their album position
  * **Note:** Verified via `tests/unit/profile.test.js` › "numbers photos by their album position, leaving a gap for a source not found" and "pads numbers to the album length, also when sources are not found". Whether the album page's `a.album-link` order equals the API's `userImageIdList` order is not checked live (a profile ZIP download would be needed).
* [x] A menu click in a JoyClub iframe saves the image below the pointer
  * **Note:** Verified via `tests/e2e/download.spec.js` › "the context menu saves the image below the pointer inside a JoyClub iframe" (failed before `all_frames`) and `tests/unit/manifest.test.js`. No live JoyClub iframe known.
* [x] A plain `<img src="….jpg">` is saved; an overlay GIF on top of nothing gives "image address not found"
  * **Note:** Verified via `tests/unit/hidden-image.test.js` › "takes the src of a plain image …", "never takes a GIF src …", "a srcset wins over the src …"; all existing E2E overlay fixtures still pass.
* [x] A feed member card is saved as `<user-name>_<photo-id>.jpg`
  * **Note:** Verified via `tests/e2e/download.spec.js` › "the context menu saves a feed member card from its picture sources under the card user name" and live 2026-10-09 (`/my_joy/feed/friends/`: card → `<user-name>_<id>.jpg`, was `unknown_<id>.jpg`).
* [x] `npm test` and `npm run test:e2e` pass
  * **Note:** `npm test` 497 pass, `npm run test:e2e` 20 pass
* [x] A failing `describeImageLayers` gives "image address not found"
  * **Note:** Code review only: the content script runs in an isolated world, so a test cannot make it throw; `null` → "image address not found" is covered by the integration test "no image below the pointer shows …".
