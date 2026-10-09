---
id: 01
dependencies: []
---

# Task 01: README states the real scope

The README no longer promises Firefox or "many websites": it says the extension runs in Chrome only and on JoyClub only.

## References

* `design.md#o-readme`
* `README.md` (intro paragraph, "Usage")
* `CLAUDE.md` ("Firefox has no `chrome.offscreen`")

## Work

* [ ] Rewrite the intro of `README.md`: Chrome only, JoyClub only, other browsers and sites not supported yet
* [ ] Remove the remaining "Chrome and Firefox" claims

## Verification

* [ ] `grep -niE 'firefox|many websites' README.md` finds no claim of support
* [ ] `npm test` passes
