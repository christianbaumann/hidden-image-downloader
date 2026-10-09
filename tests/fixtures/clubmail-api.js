// Synthetic ClubMail messages: invented ids, names and texts, no real mailbox content.
export const ORIGIN = 'https://www.joyclub.de';
const SAMPLE_ID = 'conversation-sample-1';
export const PARTNER = { id: '1000001', name: 'TestOwner' };
export const ME = { id: '1000002', name: 'TestMe' };
// Local time, so day headings and HH:MM do not depend on the test machine's time zone.
export const BASE_TIME = new Date(2026, 8, 30, 21, 0).getTime();
const MINUTE_MS = 60000;

// Message id n is sent n minutes after BASE_TIME unless time is given.
const message = (id, { from = PARTNER, time, content = '', reply = null }) => ({
  id,
  conversation_sample_id: SAMPLE_ID,
  create_time_ms: time ?? BASE_TIME + Number(id) * MINUTE_MS,
  from_user_id: from.id,
  from_user_name: from.name,
  from_user: { id: from.id, name: from.name },
  content,
  referred_message: reply,
});

export const textMessage = (id, options = {}) => ({ ...message(id, options), has_attachment: false, attachment: null });

export const attachmentMessage = (id, attachId, { fileType = '.jpg', sampleId = SAMPLE_ID, fileName = `photo-${id}.jpg`, ...options } = {}) => ({
  ...message(id, options),
  conversation_sample_id: sampleId,
  has_attachment: true,
  attachment: { attach_id: attachId, file_name: fileName, file_type: fileType, file_size: 1, is_viewable: true },
});
