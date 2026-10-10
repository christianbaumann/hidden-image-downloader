import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sedCardData, toSedCard } from '../../lib/sed-card.js';
import { sedCardResult } from '../fixtures/album-api.js';

const COUPLE_GENDER = 3;
const MALE_PAIR_GENDER = 4;
const FEMALE_PAIR_GENDER = 5;
const NONBINARY_PAIR_GENDER = 11;
const MALE_GENDER = 1;
const SHE = {
  properties: { height: 170, weight: 60, hairColor: 'DARK_BLONDE', eyeColor: 'GRAY', smoker: 'NO', zodiacSign: 'VIRGO' },
  interests: { ds: 'SWITCH', sexualOrientation: 'BI_INTERESTED' },
  preferences: [
    { key: 'TOYS', rating: 'ABSOLUTELY' },
    { key: 'KISSING', rating: 'LIKE' },
    { key: 'ANLSX', rating: 'LIKE' },
    { key: 'WEBCAM', rating: 'DISLIKE' },
    { key: 'OUTDOOR', rating: 'NONE' },
    { key: 'TNTRA', rating: 'TRY_OUT' },
  ],
};
const HE = { properties: { height: 180 }, interests: { sm: 'RATHER_MAS' }, preferences: [{ key: 'MASSAGES', rating: 'DEPENDS' }] };
const COUPLE = sedCardData(sedCardResult({ primary: SHE, partner: HE }));
const SINGLE = sedCardData(sedCardResult({ primary: SHE }));

describe('sedCardData', () => {
  test('keeps the set fields in JoyClub\'s card order and the rated preferences, per person', () => {
    assert.deepEqual(COUPLE.primary.properties, {
      height: 170, weight: 60, hairColor: 'DARK_BLONDE', eyeColor: 'GRAY', sexualOrientation: 'BI_INTERESTED', zodiacSign: 'VIRGO',
      ds: 'SWITCH', smoker: 'NO',
    });
    assert.deepEqual(Object.keys(COUPLE.primary.properties), [
      'height', 'weight', 'hairColor', 'eyeColor', 'sexualOrientation', 'zodiacSign', 'ds', 'smoker',
    ]);
    assert.equal(COUPLE.primary.preferences.length, 5);
    assert.deepEqual(COUPLE.partner, { properties: { height: 180, sm: 'RATHER_MAS' }, preferences: [{ key: 'MASSAGES', rating: 'DEPENDS' }] });
  });

  test('a single profile has no partner', () => {
    assert.equal(SINGLE.partner, null);
  });

  test('leaves out hasBirthdayToday, so the birthday does not change the fingerprint', () => {
    const birthday = sedCardResult({ primary: { properties: { height: 170, hasBirthdayToday: true } } });

    assert.deepEqual(sedCardData(birthday).primary.properties, { height: 170 });
  });

  const unusable = {
    'a failed request': null,
    'an error answer': { __typename: 'ProfileByUserIdErrorResponse', errors: [{ __typename: 'AccessDenied', message: 'x' }] },
    'an empty card': sedCardResult(),
  };
  for (const [name, raw] of Object.entries(unusable)) {
    test(`${name} → null`, () => {
      assert.equal(sedCardData(raw), null);
    });
  }

  test('BaseError properties still keep the preferences', () => {
    const raw = { ...sedCardResult({ primary: SHE }), properties: { __typename: 'AccessDenied', message: 'x' } };

    assert.deepEqual(sedCardData(raw).primary.properties, { sexualOrientation: 'BI_INTERESTED', ds: 'SWITCH' });
    assert.equal(sedCardData(raw).primary.preferences.length, 5);
  });
});

describe('toSedCard', () => {
  test('translates labels and values into German with units', () => {
    const card = toSedCard(SINGLE, { language: 'de', gender: null });

    assert.equal(card.title, 'Steckbrief');
    assert.equal(card.preferencesTitle, 'Vorlieben');
    assert.deepEqual(card.persons[0].properties, [
      { label: 'Größe', value: '170 cm' },
      { label: 'Gewicht', value: '60 kg' },
      { label: 'Haarfarbe', value: 'Dunkelblond' },
      { label: 'Augenfarbe', value: 'Grau' },
      { label: 'Neigung', value: 'Bi-interessiert' },
      { label: 'Sternzeichen', value: 'Jungfrau' },
      { label: 'Dominant / Devot', value: 'Switcher' },
      { label: 'Raucher', value: 'Nein' },
    ]);
  });

  test('groups preferences by rating in JoyClub\'s order, labels sorted, NONE left out', () => {
    assert.deepEqual(toSedCard(SINGLE, { language: 'de' }).persons[0].preferences, [
      { rating: 'Unbedingt', items: ['Sexspielzeug'] },
      { rating: 'Steh ich drauf', items: ['Analsex', 'Küssen'] },
      { rating: 'Mag ich nicht so', items: ['Webcam'] },
      { rating: 'Möchte ich gerne ausprobieren', items: ['Tantra'] },
    ]);
  });

  test('an English page gets the English table', () => {
    const card = toSedCard(COUPLE, { language: 'en', gender: COUPLE_GENDER });

    assert.equal(card.title, 'Profile');
    assert.equal(card.preferencesTitle, 'Preferences');
    assert.deepEqual(card.persons.map(({ label }) => label), ['She', 'He']);
    assert.deepEqual(card.persons[0].properties[2], { label: 'Hair colour', value: 'Dark blonde' });
    assert.deepEqual(card.persons[0].preferences[1], { rating: 'I’m into it', items: ['Anal sex', 'Kissing'] });
    assert.deepEqual(card.persons[1].properties[1], { label: 'BDSM', value: 'Rather masochistic' });
  });

  for (const language of ['', undefined, 'fr', 'de-DE']) {
    test(`page language ${JSON.stringify(language)} falls back to German`, () => {
      assert.equal(toSedCard(SINGLE, { language }).title, 'Steckbrief');
    });
  }

  const pronouns = [
    [COUPLE_GENDER, ['Sie', 'Er']],
    [MALE_PAIR_GENDER, ['Er 1', 'Er 2']],
    [FEMALE_PAIR_GENDER, ['Sie 1', 'Sie 2']],
    [NONBINARY_PAIR_GENDER, ['Person 1', 'Person 2']],
    [null, ['Person 1', 'Person 2']],
  ];
  for (const [gender, labels] of pronouns) {
    test(`a couple with gender ${gender} is labelled ${labels.join(' / ')}`, () => {
      assert.deepEqual(toSedCard(COUPLE, { language: 'de', gender }).persons.map(({ label }) => label), labels);
    });
  }

  test('a single profile shows one person without a label', () => {
    const card = toSedCard(SINGLE, { language: 'de', gender: MALE_GENDER });

    assert.deepEqual(card.persons.map(({ label }) => label), [null]);
  });

  test('a single gender code drops partner data', () => {
    assert.equal(toSedCard(COUPLE, { gender: MALE_GENDER }).persons.length, 1);
  });

  test('a couple without primary data keeps the partner and its label', () => {
    const data = sedCardData(sedCardResult({ primary: null, partner: HE }));

    assert.deepEqual(toSedCard(data, { gender: COUPLE_GENDER }).persons.map(({ label }) => label), ['Er']);
  });

  test('unknown keys, values and ratings stay raw; sizes show as JoyClub sends them', () => {
    const data = sedCardData(sedCardResult({
      primary: {
        properties: { hairColor: 'PURPLE', bodySize: '90-60-90', shoeSize: 39 },
        preferences: [{ key: 'NEW_KEY', rating: 'LIKE' }, { key: 'TOYS', rating: 'NEW_RATING' }],
      },
    }));

    const [person] = toSedCard(data).persons;

    assert.deepEqual(person.properties, [
      { label: 'Haarfarbe', value: 'PURPLE' },
      { label: 'Maße', value: '90-60-90' },
      { label: 'Schuhgröße', value: '39' },
    ]);
    assert.deepEqual(person.preferences, [
      { rating: 'Steh ich drauf', items: ['NEW_KEY'] },
      { rating: 'NEW_RATING', items: ['Sexspielzeug'] },
    ]);
  });

  test('no data → null', () => {
    assert.equal(toSedCard(null), null);
  });
});
