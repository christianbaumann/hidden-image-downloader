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

* [ ] Open real profiles with the user's session (playwright-cli, cookies, scratchpad only)
* [ ] Record the profile page DOM sections with text ("Über mich" and similar) and their selectors; note client-side rendering delays
* [ ] Search JoyClub's frontend bundle for GraphQL fields of album description and image title/caption; test them against the live API
* [ ] Write `../research-07-profile-text.md`: sections, selectors, queries, sample shapes (sanitised), limits
* [ ] If nothing usable exists: note it in `.agents/backlog.md` and mark task 08 as dropped

## Verification

* [ ] The note names concrete selectors or GraphQL fields, each confirmed on at least two live profiles
* [ ] No real personal data in the repo (only sanitised samples)
