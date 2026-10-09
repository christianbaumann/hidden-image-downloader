# Backlog

Findings not covered by an existing change.

- ClubMail attachment filenames include the sender's name (`from_user_name`), so files from both sides of a conversation can be told apart. Today: `ClubMail/<Owner>_ClubMail_<NN>_<attach_id>.<ext>` (`toClubMailConversation` in `lib/clubmail.js`), where `<Owner>` is the profile owner. Source: 2026-10-09 discussion after `.agents/changes/2026-10-09-clubmail-conversation-export/`.
- `skipped.txt` names the reason for each skipped item. Today: restricted albums appear as `<title> (<n> photos)` (`skippedReport` in `lib/profile.js`) and a failed ClubMail fetch as `ClubMail: unavailable`, without saying why (e.g. "needs the owner's permission"). Source: 2026-10-09 user request.
- Attachments the user sent themselves (`isOwn`) go into a dedicated subfolder within `ClubMail/`, so own and partner images are separated. Today all attachments land flat in `ClubMail/` (`toClubMailConversation` in `lib/clubmail.js`). Subfolder name open. Source: 2026-10-09 user request.
