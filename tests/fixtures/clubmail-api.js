// Synthetic ClubMail messages: invented ids, no real mailbox content.
export const ORIGIN = 'https://www.joyclub.de';
const SAMPLE_ID = 'conversation-sample-1';

export const textMessage = (id) => ({ id, conversation_sample_id: SAMPLE_ID, has_attachment: false, attachment: null });

export const attachmentMessage = (id, attachId, { fileType = '.jpg', sampleId = SAMPLE_ID } = {}) => ({
  id,
  conversation_sample_id: sampleId,
  has_attachment: true,
  attachment: { attach_id: attachId, file_type: fileType },
});
