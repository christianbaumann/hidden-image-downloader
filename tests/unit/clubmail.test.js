import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clubMailConversationId, clubMailConversationIds, clubMailPartnerName, fetchClubMailImages, toClubMailConversation, withReason,
} from '../../lib/clubmail.js';
import { BASE_TIME, ME, ORIGIN, PARTNER, attachmentMessage, textMessage } from '../fixtures/clubmail-api.js';

describe('clubMailConversationId', () => {
  test('puts the higher user id first', () => {
    assert.equal(clubMailConversationId('6407991', '13140627'), 'conversation-wrapper-personal-13140627-6407991');
  });

  test('gives the same id for the reverse argument order', () => {
    assert.equal(clubMailConversationId('13140627', '6407991'), clubMailConversationId('6407991', '13140627'));
  });

  test('compares numerically, not as strings', () => {
    assert.equal(clubMailConversationId('900', '1000'), 'conversation-wrapper-personal-1000-900');
  });
});

describe('clubMailConversationIds', () => {
  const URL_BASE = 'https://www.joyclub.de/clubmail/conversation/conversation-wrapper-personal-';

  test('reads both ids in URL order', () => {
    assert.deepEqual(clubMailConversationIds(`${URL_BASE}13140627-6407991/`), ['13140627', '6407991']);
    assert.deepEqual(clubMailConversationIds(`${URL_BASE}6407991-13140627/`), ['6407991', '13140627']);
  });

  test('accepts joyclub.com with a language prefix, no trailing slash, query and hash', () => {
    const url = 'https://www.joyclub.com/en/clubmail/conversation/conversation-wrapper-personal-2-1';
    assert.deepEqual(clubMailConversationIds(url), ['2', '1']);
    assert.deepEqual(clubMailConversationIds(`${url}?x=1`), ['2', '1']);
    assert.deepEqual(clubMailConversationIds(`${url}#m`), ['2', '1']);
  });

  test('returns null for other URLs', () => {
    for (const url of [
      undefined,
      '',
      'https://www.joyclub.de/clubmail/',
      'https://www.joyclub.de/profile/1000001.testowner.html',
      'https://www.joyclub.de/clubmail/conversation/conversation-wrapper-group-2-1/',
      'https://www.joyclub.de/clubmail/conversation/conversation-wrapper-personal-2-1x/',
      'https://evil.example/clubmail/conversation/conversation-wrapper-personal-2-1/',
      'http://www.joyclub.de/clubmail/conversation/conversation-wrapper-personal-2-1/',
    ]) {
      assert.equal(clubMailConversationIds(url), null, url);
    }
  });
});

describe('clubMailPartnerName', () => {
  test('takes the author of the partner\'s first message', () => {
    const messages = [textMessage('1', { from: ME }), textMessage('2', { from: PARTNER })];
    assert.equal(clubMailPartnerName({ partnerId: PARTNER.id, messages }), PARTNER.name);
  });

  test('ignores messages of a third user', () => {
    const third = { id: '1000003', name: 'Third' };
    const messages = [textMessage('1', { from: third }), textMessage('2', { from: PARTNER })];
    assert.equal(clubMailPartnerName({ partnerId: PARTNER.id, messages }), PARTNER.name);
  });

  test('skips a partner message without a name', () => {
    const nameless = { ...textMessage('1'), from_user_name: undefined, from_user: undefined };
    assert.equal(clubMailPartnerName({ partnerId: PARTNER.id, messages: [nameless, textMessage('2')] }), PARTNER.name);
  });

  test('gives an empty string when no partner message has a name', () => {
    const nameless = { ...textMessage('1'), from_user_name: undefined, from_user: undefined };
    assert.equal(clubMailPartnerName({ partnerId: PARTNER.id, messages: [nameless] }), '');
  });

  test('gives an empty string when the partner wrote nothing', () => {
    assert.equal(clubMailPartnerName({ partnerId: PARTNER.id, messages: [textMessage('1', { from: ME })] }), '');
  });
});

describe('fetchClubMailImages', () => {
  const OWN_ID = '1000002';
  const PARTNER_ID = '1000001';
  const CACHE_KILLER = 'ck-123';
  const HTTP_OK = 200;
  const HTTP_UNAUTHORIZED = 401;
  const HTTP_SERVER_ERROR = 500;
  const originalFetch = globalThis.fetch;
  let fetchCalls;
  let responses;

  const jsonResponse = (body, status = HTTP_OK) => ({ ok: status === HTTP_OK, status, json: async () => body });
  const page = (messageList, pageUp = null) => () => jsonResponse({ content: { message_list: messageList, page_up_parameter: pageUp } });
  const dataOf = (call) => JSON.parse(call.body.get('data'));

  function stubDocument(dataset = { sessionUserId: OWN_ID, cacheKiller: CACHE_KILLER }) {
    globalThis.document = { body: { dataset } };
    globalThis.location = { origin: ORIGIN };
  }

  beforeEach(() => {
    fetchCalls = [];
    responses = [page([])];
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, ...options });
      return responses[fetchCalls.length - 1]();
    };
    stubDocument();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete globalThis.document;
    delete globalThis.location;
  });

  test('posts the first page with cache_killer and the conversation id', async () => {
    await fetchClubMailImages([PARTNER_ID]);

    const [call] = fetchCalls;
    assert.equal(call.url, '/clubmailv3/get_latest_message_list_of_conversation');
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.headers, { 'x-requested-with': 'XMLHttpRequest' });
    assert.ok(call.signal instanceof AbortSignal);
    assert.equal(call.body.get('cache_killer'), CACHE_KILLER);
    assert.deepEqual(dataOf(call), {
      conversation_id: `conversation-wrapper-personal-${OWN_ID}-${PARTNER_ID}`,
      offset_message_id: null,
      limit_before: 100,
      limit_after: 100,
      inclusive: false,
      allow_blank_personal: true,
    });
  });

  test('follows page_up_parameter over three pages and returns all messages oldest first', async () => {
    const older = { conversation_id: 'x', offset_message_id: '20' };
    const oldest = { conversation_id: 'x', offset_message_id: '10' };
    const messages = [1, 2, 3, 4, 5, 6].map((id) => textMessage(String(id)));
    responses = [page(messages.slice(4), older), page(messages.slice(2, 4), oldest), page(messages.slice(0, 2))];

    const result = await fetchClubMailImages([PARTNER_ID]);

    assert.equal(fetchCalls.length, 3);
    assert.deepEqual(dataOf(fetchCalls[1]), older);
    assert.deepEqual(dataOf(fetchCalls[2]), oldest);
    assert.deepEqual(result, { origin: ORIGIN, ownId: OWN_ID, partnerId: PARTNER_ID, messages });
  });

  test('an empty conversation gives no messages', async () => {
    assert.deepEqual(await fetchClubMailImages([PARTNER_ID]), { origin: ORIGIN, ownId: OWN_ID, partnerId: PARTNER_ID, messages: [] });
  });

  test('a missing cache_killer fails with "no session" without a request', async () => {
    stubDocument({ sessionUserId: OWN_ID });

    assert.deepEqual(await fetchClubMailImages([PARTNER_ID]), { failed: true, reason: 'no session' });
    assert.equal(fetchCalls.length, 0);
  });

  test('a missing session user id fails with "no session" without a request', async () => {
    stubDocument({ cacheKiller: CACHE_KILLER });

    assert.deepEqual(await fetchClubMailImages([PARTNER_ID]), { failed: true, reason: 'no session' });
    assert.equal(fetchCalls.length, 0);
  });

  test('a missing session user id on a conversation URL gives "no session", not "not your conversation"', async () => {
    stubDocument({ cacheKiller: CACHE_KILLER });

    assert.deepEqual(await fetchClubMailImages([OWN_ID, PARTNER_ID]), { failed: true, reason: 'no session' });
    assert.equal(fetchCalls.length, 0);
  });

  test('drops the own id from the two ids of a conversation URL, in either order', async () => {
    for (const ids of [[OWN_ID, PARTNER_ID], [PARTNER_ID, OWN_ID]]) {
      fetchCalls = [];

      const result = await fetchClubMailImages(ids);

      assert.equal(dataOf(fetchCalls[0]).conversation_id, `conversation-wrapper-personal-${OWN_ID}-${PARTNER_ID}`);
      assert.equal(result.partnerId, PARTNER_ID);
    }
  });

  test('the own profile gives no messages without a request', async () => {
    assert.deepEqual(await fetchClubMailImages([OWN_ID]), { origin: ORIGIN, messages: [] });
    assert.equal(fetchCalls.length, 0);
  });

  test('a conversation of two other users fails with "not your conversation" without a request', async () => {
    assert.deepEqual(await fetchClubMailImages(['1000003', PARTNER_ID]), { failed: true, reason: 'not your conversation' });
    assert.equal(fetchCalls.length, 0);
  });

  const throwing = (error) => () => { throw error; };
  const jsonThrowing = (error) => () => ({ ok: true, status: HTTP_OK, json: async () => { throw error; } });
  const failures = {
    'HTTP 401': [() => jsonResponse({}, HTTP_UNAUTHORIZED), 'HTTP 401'],
    'HTTP 500': [() => jsonResponse({}, HTTP_SERVER_ERROR), 'HTTP 500'],
    'content null': [() => jsonResponse({ content: null }), 'bad response'],
    'empty answer': [() => jsonResponse({}), 'bad response'],
    'message_list not an array': [() => jsonResponse({ content: { message_list: {} } }), 'bad response'],
    'json() throws SyntaxError': [jsonThrowing(new SyntaxError('Unexpected token')), 'bad response'],
    'fetch times out': [throwing(new DOMException('signal timed out', 'TimeoutError')), 'timeout'],
    'fetch aborts': [throwing(new DOMException('aborted', 'AbortError')), 'timeout'],
    'json() times out': [jsonThrowing(new DOMException('signal timed out', 'TimeoutError')), 'timeout'],
    'fetch throws TypeError': [throwing(new TypeError('Failed to fetch')), 'network error'],
  };
  for (const [name, [response, reason]] of Object.entries(failures)) {
    test(`${name} on the first page → { failed: true, reason: '${reason}' }`, async () => {
      responses = [response];

      assert.deepEqual(await fetchClubMailImages([PARTNER_ID]), { failed: true, reason });
    });

    test(`${name} on a later page → { failed: true, reason: '${reason}' }`, async () => {
      responses = [page([textMessage('1')], { offset_message_id: '1' }), response];

      assert.deepEqual(await fetchClubMailImages([PARTNER_ID]), { failed: true, reason });
    });
  }

  test('keeps the failure reason when serialised like executeScript does', async () => {
    const serialised = new Function(`return (${fetchClubMailImages.toString()})`)();
    responses = [() => jsonResponse({}, HTTP_SERVER_ERROR)];

    assert.deepEqual(await serialised([PARTNER_ID]), { failed: true, reason: 'HTTP 500' });
  });

  test('stays self-contained when serialised like executeScript does', async () => {
    const serialised = new Function(`return (${fetchClubMailImages.toString()})`)();
    responses = [page([attachmentMessage('1', 'a1')])];

    assert.deepEqual(await serialised([PARTNER_ID]), { origin: ORIGIN, ownId: OWN_ID, partnerId: PARTNER_ID, messages: [attachmentMessage('1', 'a1')] });
  });
});

describe('withReason', () => {
  test('appends a reason in parentheses', () => {
    assert.equal(withReason('ClubMail unavailable', 'HTTP 500'), 'ClubMail unavailable (HTTP 500)');
  });

  test('an undefined or empty reason gives the bare text', () => {
    assert.equal(withReason('ClubMail unavailable', undefined), 'ClubMail unavailable');
    assert.equal(withReason('ClubMail unavailable', ''), 'ClubMail unavailable');
  });
});

describe('toClubMailConversation entries', () => {
  const entries = (messages) => toClubMailConversation({ origin: ORIGIN, messages }, 'TestOwner', 'ClubMail').entries;

  test('names attachments <folder>/<owner>_<folder>_<NN>_<attach_id>.<ext> in message order', () => {
    const result = entries([
      attachmentMessage('11', 'a1'),
      textMessage('12'),
      attachmentMessage('13', 'a2', { fileType: '.PNG' }),
    ]);

    assert.deepEqual(result.map(({ name }) => name), [
      'ClubMail/TestOwner_ClubMail_01_a1.jpg',
      'ClubMail/TestOwner_ClubMail_02_a2.png',
    ]);
  });

  test('carries the attach_id as attachmentId', () => {
    assert.deepEqual(entries([attachmentMessage('11', 'a1')]).map(({ attachmentId }) => attachmentId), ['a1']);
  });

  test('builds an absolute download URL from the message and its sample id', () => {
    const [entry] = entries([attachmentMessage('11', 'a1', { sampleId: 'conversation-sample-9' })]);

    assert.equal(
      entry.url,
      `${ORIGIN}/clubmailv3/attachment/download/?attachment_id=a1&conversation_sample_id=conversation-sample-9&message_id=11`,
    );
  });

  test('falls back to bin for an unusable file_type', () => {
    const [entry] = entries([attachmentMessage('11', 'a1', { fileType: '../x' })]);

    assert.equal(entry.name, 'ClubMail/TestOwner_ClubMail_01_a1.bin');
  });

  test('pads the number to three digits from 100 attachments', () => {
    const result = entries(Array.from({ length: 100 }, (_, index) => attachmentMessage(String(index), `a${index}`)));

    assert.equal(result[0].name, 'ClubMail/TestOwner_ClubMail_001_a0.jpg');
    assert.equal(result[99].name, 'ClubMail/TestOwner_ClubMail_100_a99.jpg');
  });

  test('skips an attachment without attach_id', () => {
    assert.deepEqual(entries([attachmentMessage('11', '')]), []);
  });

  test('gives no entries without attachments', () => {
    assert.deepEqual(entries([textMessage('1')]), []);
  });
});

describe('toClubMailConversation messages', () => {
  const messagesOf = (messages) => toClubMailConversation({ origin: ORIGIN, messages }, 'TestOwner', 'ClubMail').messages;

  test('maps author, time and content in message order', () => {
    const result = messagesOf([textMessage('1', { content: 'Hi' }), textMessage('2', { from: ME, content: 'Hello' })]);

    assert.deepEqual(result, [
      { author: 'TestOwner', isOwn: false, time: BASE_TIME + 60000, content: 'Hi', reply: null, attachment: null },
      { author: 'TestMe', isOwn: false, time: BASE_TIME + 120000, content: 'Hello', reply: null, attachment: null },
    ]);
  });

  test('falls back from from_user_name to from_user.name to "Unknown"', () => {
    const withoutName = { ...textMessage('1'), from_user_name: undefined, from_user: { name: 'Fallback' } };
    const withoutAny = { ...textMessage('2'), from_user_name: '  ', from_user: undefined };

    assert.deepEqual(messagesOf([withoutName, withoutAny]).map(({ author }) => author), ['Fallback', 'Unknown']);
  });

  test('marks the messages of ownId as own; a notice without sender is not own', () => {
    const notice = { ...textMessage('3'), from_user_id: undefined, from_user_name: undefined, from_user: undefined };
    const raw = { origin: ORIGIN, ownId: ME.id, messages: [textMessage('1'), textMessage('2', { from: ME }), notice] };

    const flags = toClubMailConversation(raw, 'TestOwner', 'ClubMail').messages.map(({ isOwn }) => isOwn);

    assert.deepEqual(flags, [false, true, false]);
  });

  test('compares ownId with a numeric from_user_id', () => {
    const raw = { origin: ORIGIN, ownId: ME.id, messages: [{ ...textMessage('1', { from: ME }), from_user_id: Number(ME.id) }] };

    assert.equal(toClubMailConversation(raw, 'TestOwner', 'ClubMail').messages[0].isOwn, true);
  });

  test('missing content becomes an empty string', () => {
    const [message] = messagesOf([{ ...textMessage('1'), content: undefined }]);

    assert.equal(message.content, '');
  });

  test('a reply carries the quoted message\'s author, time and content', () => {
    const quoted = { ...textMessage('1', { from: ME, content: 'Question?' }), from_user_name: undefined };
    const [message] = messagesOf([textMessage('2', { content: 'Answer', reply: quoted })]);

    assert.deepEqual(message.reply, { author: 'TestMe', time: BASE_TIME + 60000, content: 'Question?' });
  });

  test('an attachment names the entry file relative to the folder', () => {
    const result = messagesOf([
      attachmentMessage('1', 'a1', { fileName: 'beach.jpg' }),
      attachmentMessage('2', 'a2', { fileType: '.pdf', fileName: '' }),
    ]);

    assert.deepEqual(result.map(({ attachment }) => attachment), [
      { file: 'TestOwner_ClubMail_01_a1.jpg', name: 'beach.jpg', isImage: true },
      { file: 'TestOwner_ClubMail_02_a2.pdf', name: 'TestOwner_ClubMail_02_a2.pdf', isImage: false },
    ]);
  });

  test('an attachment without attach_id gives no attachment', () => {
    const [message] = messagesOf([attachmentMessage('1', '')]);

    assert.equal(message.attachment, null);
  });
});

describe('toClubMailConversation own attachments', () => {
  const convert = (messages) => toClubMailConversation({ origin: ORIGIN, ownId: ME.id, messages }, 'TestOwner', 'ClubMail');
  const names = (messages) => convert(messages).entries.map(({ name }) => name);
  const own = (id, attachId, options = {}) => attachmentMessage(id, attachId, { from: ME, ...options });

  test('puts own attachments into <folder>/Own/<own name>_<folder>_<NN>_<attach_id>.<ext>', () => {
    assert.deepEqual(names([attachmentMessage('1', 'a1'), own('2', 'a2')]), [
      'ClubMail/TestOwner_ClubMail_01_a1.jpg',
      'ClubMail/Own/TestMe_ClubMail_01_a2.jpg',
    ]);
  });

  test('numbers own and partner attachments separately, in message order', () => {
    assert.deepEqual(names([attachmentMessage('1', 'a1'), own('2', 'a2'), attachmentMessage('3', 'a3'), own('4', 'a4')]), [
      'ClubMail/TestOwner_ClubMail_01_a1.jpg',
      'ClubMail/Own/TestMe_ClubMail_01_a2.jpg',
      'ClubMail/TestOwner_ClubMail_02_a3.jpg',
      'ClubMail/Own/TestMe_ClubMail_02_a4.jpg',
    ]);
  });

  test('pads per folder: 100 own attachments get three digits, one partner attachment keeps two', () => {
    const result = names([attachmentMessage('0', 'p0'), ...Array.from({ length: 100 }, (_, index) => own(String(index + 1), `a${index}`))]);

    assert.equal(result[0], 'ClubMail/TestOwner_ClubMail_01_p0.jpg');
    assert.equal(result[1], 'ClubMail/Own/TestMe_ClubMail_001_a0.jpg');
    assert.equal(result[100], 'ClubMail/Own/TestMe_ClubMail_100_a99.jpg');
  });

  test('99 own attachments keep two digits', () => {
    const result = names(Array.from({ length: 99 }, (_, index) => own(String(index + 1), `a${index}`)));

    assert.equal(result[98], 'ClubMail/Own/TestMe_ClubMail_99_a98.jpg');
  });

  test('takes the own name from an own text message when the attachment message has none', () => {
    const nameless = { ...own('2', 'a2'), from_user_name: undefined, from_user: undefined };

    assert.deepEqual(names([textMessage('1', { from: ME }), nameless]), ['ClubMail/Own/TestMe_ClubMail_01_a2.jpg']);
  });

  test('skips own messages without a name and takes the first real one', () => {
    const blank = { ...textMessage('1', { from: ME }), from_user_name: '  ', from_user: undefined };

    assert.deepEqual(names([blank, own('2', 'a2', { from: { ...ME, name: 'Me Later' } })]), ['ClubMail/Own/Me-Later_ClubMail_01_a2.jpg']);
  });

  test('falls back to unknown when no own message has a name', () => {
    const nameless = { ...own('2', 'a2'), from_user_name: undefined, from_user: undefined };

    assert.deepEqual(names([nameless]), ['ClubMail/Own/unknown_ClubMail_01_a2.jpg']);
  });

  test('sanitises the own name', () => {
    assert.deepEqual(names([own('1', 'a1', { from: { ...ME, name: 'A/B: C' } })]), ['ClubMail/Own/A_B_-C_ClubMail_01_a1.jpg']);
  });

  test('without ownId every attachment stays in <folder>/', () => {
    const raw = { origin: ORIGIN, messages: [own('1', 'a1')] };

    assert.deepEqual(toClubMailConversation(raw, 'TestOwner', 'ClubMail').entries.map(({ name }) => name), ['ClubMail/TestOwner_ClubMail_01_a1.jpg']);
  });

  test('a numeric from_user_id matching ownId goes to Own/', () => {
    assert.deepEqual(names([{ ...own('1', 'a1'), from_user_id: Number(ME.id) }]), ['ClubMail/Own/TestMe_ClubMail_01_a1.jpg']);
  });

  test('a notice without sender stays in the partner folder', () => {
    const notice = { ...attachmentMessage('1', 'a1'), from_user_id: undefined, from_user_name: undefined, from_user: undefined };

    assert.deepEqual(names([notice]), ['ClubMail/TestOwner_ClubMail_01_a1.jpg']);
  });

  test('an own attachment names its file Own/<file>; without file_name its name is the bare file', () => {
    const result = convert([own('1', 'a1'), own('2', 'a2', { fileType: '.pdf', fileName: '' })]).messages;

    assert.deepEqual(result.map(({ attachment }) => attachment), [
      { file: 'Own/TestMe_ClubMail_01_a1.jpg', name: 'photo-1.jpg', isImage: true },
      { file: 'Own/TestMe_ClubMail_02_a2.pdf', name: 'TestMe_ClubMail_02_a2.pdf', isImage: false },
    ]);
  });

  test('the same attach_id from both sides gives two distinct entries', () => {
    assert.deepEqual(names([attachmentMessage('1', 'x'), own('2', 'x')]), [
      'ClubMail/TestOwner_ClubMail_01_x.jpg',
      'ClubMail/Own/TestMe_ClubMail_01_x.jpg',
    ]);
  });
});
