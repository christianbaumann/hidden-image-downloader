---
id: 01
dependencies: []
---

# Task 01: README states the real scope

**Status:** Done.

The README no longer promises Firefox or "many websites": it says the extension runs in Chrome only and on JoyClub only.

## References

* `design.md#o-readme`
* `README.md` (intro paragraph, "Usage")
* `CLAUDE.md` ("Firefox has no `chrome.offscreen`")

## Work

* [x] Rewrite the intro of `README.md`: Chrome only, JoyClub only, other browsers and sites not supported yet
* [x] Remove the remaining "Chrome and Firefox" claims

## Verification

* [x] `grep -niE 'firefox|many websites' README.md` finds no claim of support
  **Note:** Verified via grep: the only hit is README line 5, which states that Firefox is not supported. `CLAUDE.md` lines 3 and 7 ("Chrome/Firefox extension", "Targets: Chrome and Firefox") aligned too.
* [x] `npm test` passes
  **Note:** Verified via `npm test` (lint + 435 tests, 0 failures). Docs-only change, no E2E run.
