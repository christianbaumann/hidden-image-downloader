---
id: 07
dependencies: []
---

# Task 07: Spike: profile text and caption fields

A research note states which profile text sections and which album and photo text fields JoyClub offers, and how to read them, so task 08 can be designed on facts.

## References

* `design.md#h-profile-text-and-captions`
* `design.md#live-spikes-before-h-and-j`
* `CLAUDE.md` ("Live check against a real session", album path, GraphQL notes)
* `lib/profile.js` (`LIST_QUERY`, `SOURCES_QUERY`)

## Work

* [x] Open real profiles with the user's session (playwright-cli, cookies, scratchpad only)
* [x] Record the profile page DOM sections with text ("Über mich" and similar) and their selectors; note client-side rendering delays
* [x] Search JoyClub's frontend bundle for GraphQL fields of album description and image title/caption; test them against the live API **Note:** captured from JoyClub's own requests on a profile and an album page instead of searching the bundle: same source, full queries
* [x] Write `../research-07-profile-text.md`: sections, selectors, queries, sample shapes (sanitised), limits
* [x] If nothing usable exists: note it in `.agents/backlog.md` and mark task 08 as dropped **Note:** not needed, all fields exist; task 08 stays

## Verification

* [x] The note names concrete selectors or GraphQL fields, each confirmed on at least two live profiles **Note:** profile text on 21 profiles, photo titles on 18, album descriptions on 2, DOM selectors on 2; exception: photo `description` was set on one photo only (stated in the note)
* [x] No real personal data in the repo (only sanitised samples) **Note:** the note holds counts, field names and synthetic samples only; captures and downloads stayed in the scratchpad

## Verification run (2026-10-09)

* The queries proposed for task 08 (`LIST_QUERY` with album `description`, `byIdList` + `source` in one request) sent live on 2 profiles: no errors, every photo has a title result and a source, same order.
* Review by subagent: no personal data, counts consistent. Fixed in the note: `Int!` needs `Number(userId)`; profile text and captions get their own request and try/catch so they can't fail the ZIP; the profile text request runs in parallel with the album list; Markdown conversion escapes first; denominators added; main album description marked as not tried.

**Approved** after verification (all items automated; no manual step left).
