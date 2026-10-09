---
datetime: 2026-10-09T09:45:00+02:00
author: Christian Baumann
tags: [clubmail, transcript, zip, dispatch]
---

# ClubMail conversation export

The extension saves the attachments of a ClubMail conversation, but not the conversation itself. This change adds the conversation as `conversation.md` and `conversation.html` to the ZIP. It also makes a click on an open ClubMail conversation start a ClubMail-only export.

Related:
- Current ClubMail path: `lib/clubmail.js` (`fetchClubMailImages`, `toClubMailEntries`), `lib/profile.js` (`toAlbumZipRequest`), `background.js` (`handleActionClick`)
- Project conventions: `CLAUDE.md` (sections "ClubMail path" and "Click dispatch")
- Blueprint renderer: `/Users/christian.baumann/git_repos/_own/ms-teams-chat-exporter/markdown.js` (`renderMarkdown`)
- Previous change: `.agents/changes/2026-10-09-clubmail-progress-retries/`

## Today and target

Today a click dispatches like this. The fetcher loads every message but keeps only the attachments:

```text
handleActionClick(tab)
  profileUserId(tab.url) ?
    yes → fetchProfileAlbums + fetchClubMailImages   (in the tab, in parallel)
          toAlbumZipRequest → entries (albums + ClubMail attachments)
    no  → lightbox path      ← ClubMail conversation URL ends here and fails
```

Target:

```diff
 handleActionClick(tab)
+  clubMailConversationIds(tab.url) ?
+    yes → fetchClubMailImages(ids)
+          toClubMailZipRequest → ClubMail-only ZIP
   profileUserId(tab.url) ?
     yes → fetchProfileAlbums + fetchClubMailImages
-          toAlbumZipRequest → entries
+          toAlbumZipRequest → entries + ClubMail/conversation.{md,html}
     no  → lightbox path
```

ZIP content:

```text
<Owner>.zip                             (profile click)
├── <Album>/…
└── ClubMail/
    ├── conversation.md                 new
    ├── conversation.html               new
    └── <Owner>_ClubMail_<NN>_<attach_id>.<ext>

<Partner>_ClubMail.zip                  (conversation click, new)
└── ClubMail/                           same content as above
```

## Facts from the live session (2026-10-09)

Checked against a real session (4 read conversations, 67 messages) with Playwright and the user's cookies. The raw data stays in the session scratchpad and is not committed.

- **Conversation URL:** `https://www.joyclub.de/clubmail/conversation/conversation-wrapper-personal-<high>-<low>/`. Both user ids are in the URL. One of them is the user's own id (`body[data-session-user-id]`). The page also has `body[data-cache-killer]`.
- **Message fields used:**

  | Field | Content |
  |---|---|
  | `create_time_ms` | send time, epoch ms |
  | `from_user_id` | sender id |
  | `from_user_name` | sender name; missing on some messages |
  | `from_user.name` | fallback name; `from_user` can be missing |
  | `content` | HTML string, can be empty (for example a message with only an attachment) |
  | `attachment.{attach_id, file_name, file_type, file_size, is_viewable}` | attachment metadata |
  | `referred_message` | full message object of a quoted message (reply); 25 of 49 messages in one conversation |

- **`content` markup seen:** `<br />`, `<a class="j-anchor primary" href="…">`, smileys as `<img class="joy_smiley" src="//cfnimg.joyclub.de/smile/….gif" alt="…">`, entities `&quot;` and `&amp;`.
- One personal conversation has messages from a third user id without `from_user_name`.
- Pages arrive oldest first. Only `.jpg` attachments were seen.
- Opening a conversation in the UI calls `/clubmailv3/read_conversation`. `get_latest_message_list_of_conversation` alone does not mark anything read.
- Not verified: an unread conversation (the test conversation was already read on the server), and non-image attachments.

## Key Decisions

### Transcript formats

- **Decision:** Two files in `ClubMail/`: `conversation.md` and `conversation.html`. Both show image attachments inline.
- **Reason:** Markdown reads as plain text and follows the tested blueprint. HTML shows the conversation with images in any browser.
- **Trade-offs:** Two renderers to maintain and test. Rejected: plain text (no image links), JSON dump (not readable).

### Trigger on an open conversation

- **Decision:** A click on a conversation URL saves a ClubMail-only ZIP (`<Partner>_ClubMail.zip`). `clubMailConversationIds(url)` runs before `profileUserId(url)`. The profile path stays the same and also gets the transcripts.
- **Reason:** In a conversation the user wants the conversation. It skips the album API, the 3 s title wait and the photo fetches.
- **Trade-offs:** Rejected: the full profile ZIP from a conversation page (slow, needs the partner id first) and loose files without a ZIP (relative links break).

### Partner id on a conversation page

- **Decision:** `fetchClubMailImages` takes the user ids from the URL (one id from a profile URL, two from a conversation URL). It drops the own id, which it reads from `body[data-session-user-id]`, and builds the conversation id as today.
- **Reason:** The service worker cannot know the own id. The injected fetcher already reads it.
- **Trade-offs:** The injected function's parameter changes. It must stay self-contained, so it keeps its own copy of the id rule.

### One message model, two renderers

- **Decision:** One pure function (in `lib/clubmail.js`) maps the raw messages to the attachment entries and a message model. Two pure renderers make the md and the html from that model.

  ```text
  raw { origin, messages }
    └─ toClubMailConversation(raw, owner, folder)
         ├─ entries   [{ url, name }]               → buildZip fetches these
         └─ messages  [{ author, time, text, reply, attachment: { file, isImage } }]
              ├─ renderConversationMarkdown → ClubMail/conversation.md
              └─ renderConversationHtml     → ClubMail/conversation.html
  ```

- **Reason:** Entries and transcripts then use the same attachment filenames. Every function can be unit tested without a browser.
- **Trade-offs:** `toClubMailEntries` gets a sibling or is replaced. Rejected: an HTML-from-Markdown converter.

### Transcripts are text files in the ZIP request

- **Decision:** The service worker renders both files before the build and passes them as text files in the ZIP request, like `missing.txt` and `skipped.txt` (`reports: [{ name, text }]`).
- **Reason:** The existing `buildZip` path already writes text files. No new message type is needed.
- **Trade-offs:** The transcripts are written before the attachments are fetched, so a missing attachment has no inline "(missing)" marker. Its link is broken, and `missing.txt` lists it. This replaces the earlier "(missing)" idea to keep the build path unchanged.

### Content conversion without a DOM

- **Decision:** A pure allowlist converter in `lib/`:

  | Input | Markdown | HTML |
  |---|---|---|
  | `<br>` | newline | `<br>` |
  | `<img class="joy_smiley" alt="x">` | `x` | `x` |
  | `<a href="http(s)://…">t</a>` | `[t](href)` | escaped `<a href>` |
  | `<a>` with another scheme | `t` | `t` |
  | entities | decoded | decoded, then escaped |
  | any other tag | stripped | stripped |

- **Reason:** The service worker has no `DOMParser`. The markup is limited to a few tags. Smileys as text keep the files offline.
- **Trade-offs:** Unknown markup loses its formatting. Rejected: vendored turndown or a Markdown library (more weight, needs a DOM or an extra dependency).

### Layout

- **Decision:** Same layout as the blueprint:
  - Title `ClubMail with <Partner>`, then `Exported <date time> · <N> messages`.
  - One heading for each day, then `**<Author>** · HH:MM` for each message.
  - Local time from `create_time_ms`.
  - Author: `from_user_name`, then `from_user.name`, then "Unknown". The user's own messages show the user's name.
  - A reply starts with `> Reply to <author>, <time>: <snippet>` (md) or a `<blockquote>` (html).

  ```md
  # ClubMail with <Partner>
  Exported 2026-10-09 14:02 · 49 messages

  ## 2026-09-30

  **<Partner>** · 21:14
  > Reply to <Me>, 2026-09-30 21:10: Hi …
  Text …

  **<Me>** · 21:20
  ![attachment](<Owner>_ClubMail_01_123.jpg)
  ```

- **Reason:** It follows a format that is already tested. Replies are common, so they need context.
- **Trade-offs:** The reply snippet is shortened, so the full quoted text is not repeated.

### Attachments in the transcript

- **Decision:** Images show inline (`![](file)` / `<img src="file">`). Other file types are links. Paths are relative, because both transcripts sit next to the attachments in `ClubMail/`.
- **Reason:** Both formats show the images, and the links work after unzipping.
- **Trade-offs:** The image check uses `file_type`; only `.jpg` was seen live.

### Self-contained, escaped HTML

- **Decision:** One HTML file with an inline `<style>`. Every value is escaped. Only http(s) links are kept, and nothing loads from a remote server.
- **Reason:** Message text comes from other users. The file must open offline and be safe to open.
- **Trade-offs:** No remote smiley images, no avatars.

### Read state

- **Decision:** The export does not call `read_conversation`. An unread conversation stays unread, as the README promises today.
- **Reason:** Exporting should not change the account's state.
- **Trade-offs:** None. Confirmed by the user on 2026-10-09: unread conversations must stay unread.

### Failure and empty cases

- **Decision:**
  - Profile click: as today. A ClubMail failure adds `ClubMail: unavailable` to `skipped.txt` and shows the amber badge. An empty conversation has no `ClubMail/` folder.
  - Conversation click: a failure shows the red badge "ClubMail unavailable". A conversation without messages shows the red badge with the existing "nothing to download" reason.
- **Reason:** On a conversation page ClubMail is the only content, so a failure is fatal.
- **Trade-offs:** A conversation with text but no attachments still gives a ZIP that holds only the two transcripts.

### Progress

- **Decision:** The conversation click uses the same badge flow: API phase 0 → 10 %, then the attachment count.
- **Reason:** It reuses `extractAllWithProgress` and the offscreen progress messages without changes.
- **Trade-offs:** None.

## Testing

| Layer | What |
|---|---|
| Unit | converter (each row of the table above), model mapping (author fallbacks, reply, attachment file names), both renderers, `clubMailConversationIds` |
| Integration | `handleActionClick` dispatch for a conversation URL (stubbed `chrome`) |
| E2E | conversation URL → ZIP with both transcripts and attachments; profile ZIP has both transcripts. Unzip with the `jszip` devDependency. Fixture page `tests/e2e/fixtures/` (sanitised) |
| Manual | README check against a real conversation with replies, smileys and links: open `conversation.html` offline, images show; unread conversation stays unread |

Fixture data stays synthetic: extend `tests/fixtures/clubmail-api.js` with `content`, `from_user_name`, `create_time_ms` and `referred_message`.

## Slices

1. Transcripts in the profile ZIP (model, converter, both renderers, `toAlbumZipRequest`).
2. Conversation-page trigger (`clubMailConversationIds`, fetcher parameter, ClubMail-only ZIP request, dispatch).

## Out of scope

- Firefox (no `chrome.offscreen`).
- Group and system conversations (`conversation_type` other than `P`).
- Voice messages, shared locations, video calls (not seen live).
