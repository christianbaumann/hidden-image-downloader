// "Steckbrief" and "Vorlieben" from getProfileSedCardDataByUserId, translated with JoyClub's own labels
// (frontend bundle joyclub-vue@26.41.0, de-DE and en-GB). An unknown key or value stays the raw enum string.

const PROFILE_DESCRIPTION = 'ProfileDescription';
const USER_PROPERTIES = 'UserProperties';
const NOT_RATED = 'NONE';
const ENGLISH = /^en\b/i;

// JoyClub's card order; hasBirthdayToday is left out, since it would change the fingerprint on the birthday.
const PROPERTY_FIELDS = [
  'height', 'weight', 'hairColor', 'eyeColor', 'appearance', 'bodySize', 'clothSize', 'cupSize', 'shoeSize',
  'sexualOrientation', 'zodiacSign', 'ds', 'sm', 'smoker', 'children',
];
const UNITS = { height: 'cm', weight: 'kg' };
const RATING_ORDER = ['ABSOLUTELY', 'LIKE', 'DEPENDS', 'DISLIKE', 'ABSOLUTELY_NOT', 'TRY_OUT'];

// JoyClub's universal gender codes of couple profiles (j-gender-icon in the profile header); the others are single profiles.
const PAIR = {
  PAIR: 3, MALE_PAIR: 4, FEMALE_PAIR: 5, NONBINARY_FEMALE_PAIR: 9, NONBINARY_MALE_PAIR: 10, NONBINARY_NONBINARY_PAIR: 11,
  TRANSFEMALE_FEMALE_PAIR: 12, TRANSFEMALE_MALE_PAIR: 13, TRANSFEMALE_NONBINARY_PAIR: 14, TRANSFEMALE_TRANSFEMALE_PAIR: 15,
  TRANSMALE_FEMALE_PAIR: 22, TRANSMALE_MALE_PAIR: 23, TRANSMALE_NONBINARY_PAIR: 24, TRANSMALE_TRANSFEMALE_PAIR: 25,
  TRANSMALE_TRANSMALE_PAIR: 27,
};
// Which pronoun pair JoyClub's sed card shows per code; every other couple gets "Person 1"/"Person 2".
const SHE_HE_GENDERS = new Set([PAIR.PAIR, PAIR.TRANSFEMALE_MALE_PAIR, PAIR.TRANSMALE_TRANSFEMALE_PAIR]);
const HE_HE_GENDERS = new Set([PAIR.MALE_PAIR, PAIR.TRANSMALE_MALE_PAIR, PAIR.TRANSMALE_TRANSMALE_PAIR]);
const SHE_SHE_GENDERS = new Set([PAIR.FEMALE_PAIR, PAIR.TRANSFEMALE_FEMALE_PAIR, PAIR.TRANSFEMALE_TRANSFEMALE_PAIR]);
const COUPLE_GENDERS = new Set(Object.values(PAIR));

const GERMAN = {
  locale: 'de',
  sedCard: 'Steckbrief',
  preferences: 'Vorlieben',
  pronouns: { sheHe: ['Sie', 'Er'], heHe: ['Er 1', 'Er 2'], sheShe: ['Sie 1', 'Sie 2'], other: ['Person 1', 'Person 2'] },
  labels: {
    height: 'Größe', weight: 'Gewicht', hairColor: 'Haarfarbe', eyeColor: 'Augenfarbe', appearance: 'Aussehen',
    bodySize: 'Maße', clothSize: 'Kleidergröße', cupSize: 'Oberweite', shoeSize: 'Schuhgröße', sexualOrientation: 'Neigung',
    zodiacSign: 'Sternzeichen', ds: 'Dominant / Devot', sm: 'Sadomaso', smoker: 'Raucher', children: 'Kinder',
  },
  values: {
    hairColor: {
      NONE: 'Keine', BLONDE: 'Blond', DARK_BLONDE: 'Dunkelblond', BROWN: 'Braun', RED: 'Rot', BLACK: 'Schwarz', GREY: 'Grau',
      COLORFUL: 'Bunt',
    },
    eyeColor: { BLUE: 'Blau', GRAY: 'Grau', GREEN: 'Grün', BROWN: 'Braun', GREY_BLUE: 'Graublau', BROWN_GREEN: 'Braungrün' },
    appearance: {
      CLASSIC: 'Klassisch', CASUAL: 'Lässig', SPORTY: 'Sportlich', STYLISH: 'Modisch', INDIVIDUAL: 'Individuell',
      ALTERNATIVE: 'Alternativ',
    },
    smoker: { NO: 'Nein', YES: 'Ja', OCCASIONALLY: 'Gelegentlich' },
    children: { NO: 'Nein', YES: 'Ja, ich habe Kinder', YES_MOVED_OUT: 'Ja, wohnen aber nicht bei mir' },
    sexualOrientation: {
      HETEROSEXUAL: 'Heterosexuell', BI_INTERESTED: 'Bi-interessiert', BISEXUAL: 'Bisexuell', HOMOSEXUAL: 'Homosexuell',
      PANSEXUAL: 'Pansexuell',
    },
    ds: {
      NEITHER: 'Weder noch', DOM: 'Dominant', RATHER_DOM: 'Eher dominant', SWITCH: 'Switcher', RATHER_SUB: 'Eher devot',
      SUB: 'Devot',
    },
    sm: {
      NEITHER: 'Weder noch', SAD: 'Sadistisch', RATHER_SAD: 'Eher sadistisch', SWITCH: 'Switcher',
      RATHER_MAS: 'Eher masochistisch', MAS: 'Masochistisch',
    },
    zodiacSign: {
      ARIES: 'Widder', TAURUS: 'Stier', GEMINI: 'Zwillinge', CANCER: 'Krebs', LEO: 'Löwe', VIRGO: 'Jungfrau', LIBRA: 'Waage',
      SCORPIO: 'Skorpion', SAGITTARIUS: 'Schütze', CAPRICORN: 'Steinbock', AQUARIUS: 'Wassermann', PISCES: 'Fische',
    },
  },
  ratings: {
    ABSOLUTELY: 'Unbedingt', LIKE: 'Steh ich drauf', DEPENDS: 'Situationsabhängig', DISLIKE: 'Mag ich nicht so',
    ABSOLUTELY_NOT: 'Geht gar nicht', TRY_OUT: 'Möchte ich gerne ausprobieren',
  },
  preferenceKeys: {
    ANLSX: 'Analsex', BDS: 'SM, BDSM', BJ: 'Blowjob', BLINDFOLD: 'Augen verbinden', BODY_HAIR: 'Körperbehaarung',
    BOND: 'Bondage, Fesseln', CCKLDNG: 'Cuckolding', CHATS: 'Erotische Chats', CHUBBY: 'Mollig', CORSETS: 'Korsetts & Corsagen',
    CUDDLINGSX: 'Kuschelsex', CUNNI: 'Cunnilingus', DESSOUS: 'Dessous', DRTY_TALK: 'Dirty Talk', EXHIBI: 'Exhibitionismus',
    FEET: 'Fußerotik', FETI: 'Fetisch', FFM: 'Dreier FFM', FILMING: 'Filmen', FKK: 'FKK', FRI_PARTIES: 'Frivoles Ausgehen',
    FSTNG: 'Fisting', GANG: 'Gangbang', GROUPSX: 'Gruppensex', HAND: 'Handjob', HIGH_HEELS: 'High Heels',
    INT_HAIR: 'Intimbehaarung', INT_JEWELRY: 'Intimschmuck', INT_SHAVE: 'Intimrasur', KAMASUTRA: 'Kamasutra',
    KISSING: 'Küssen', LATEX: 'Lack, Leder & Latex', LET_WATCH: 'Zuschauen lassen', MASSAGES: 'Massagen',
    MAST: 'Selbstbefriedigung', MFMF: 'Paarsex MFMF', MMF: 'Dreier MMF', NORMALSX: 'Normaler Sex', NYLONS: 'Nylons',
    NYM: 'Nymphoman', OLDER_THAN_ME: 'Ältere', OUTDOOR: 'Outdoor', PHOTO: 'Fotografieren', PI: 'Natursekt',
    PICTURE_EXCHANGE: 'Bildertausch', PIERCINGS: 'Piercings', PRN: 'Pornos', RIM: 'Rimming', ROLE_PLAY: 'Rollenspiele',
    ROUGHSX: 'Harter Sex', SLIM: 'Schlank', SLOWSX: 'Slow Sex', SPECIAL_PLACES: 'Besondere Orte', SPNK: 'Spanking',
    SPRM: 'Spermaspiele', SQURT: 'Squirting', STRAPSX: 'Strapon-Sex', STRP: 'Strip', TATTOOS: 'Tattoos',
    TELEPHONESX: 'Telefonsex', TNTRA: 'Tantra', TOYS: 'Sexspielzeug', WATCH: 'Zuschauen', WEBCAM: 'Webcam',
    W_SHARING: 'Wifesharing', YOUNGER_THAN_ME: 'Jüngere',
  },
};

const ENGLISH_TABLE = {
  locale: 'en',
  sedCard: 'Profile',
  preferences: 'Preferences',
  pronouns: { sheHe: ['She', 'He'], heHe: ['He 1', 'He 2'], sheShe: ['She 1', 'She 2'], other: ['Person 1', 'Person 2'] },
  labels: {
    height: 'Height', weight: 'Weight', hairColor: 'Hair colour', eyeColor: 'Eye colour', appearance: 'Appearance',
    bodySize: 'Measurements', clothSize: 'Clothing size', cupSize: 'Bust size', shoeSize: 'Shoe size',
    sexualOrientation: 'Orientation', zodiacSign: 'Star sign', ds: 'Dom/sub', sm: 'BDSM', smoker: 'Smoker', children: 'Children',
  },
  values: {
    hairColor: {
      NONE: 'None', BLONDE: 'Blonde', DARK_BLONDE: 'Dark blonde', BROWN: 'Brown', RED: 'Red', BLACK: 'Black', GREY: 'Grey',
      COLORFUL: 'Colourful',
    },
    eyeColor: { BLUE: 'Blue', GRAY: 'Grey', GREEN: 'Green', BROWN: 'Brown', GREY_BLUE: 'Grey-blue', BROWN_GREEN: 'Brownish green' },
    appearance: {
      CLASSIC: 'Classic', CASUAL: 'Casual', SPORTY: 'Athletic', STYLISH: 'Fashionable', INDIVIDUAL: 'Unique',
      ALTERNATIVE: 'Alternative',
    },
    smoker: { NO: 'No', YES: 'Yes', OCCASIONALLY: 'From time to time' },
    children: { NO: 'No', YES: 'Yes, I have children', YES_MOVED_OUT: 'Yes, but they don’t live with me' },
    sexualOrientation: {
      HETEROSEXUAL: 'Heterosexual', BI_INTERESTED: 'Bi-curious', BISEXUAL: 'Bisexual', HOMOSEXUAL: 'Gay', PANSEXUAL: 'Pansexual',
    },
    ds: { NEITHER: 'Neither', DOM: 'Dom', RATHER_DOM: 'More dom', SWITCH: 'Switcher', RATHER_SUB: 'More sub', SUB: 'Sub' },
    sm: {
      NEITHER: 'Neither', SAD: 'Sadistic', RATHER_SAD: 'Rather sadistic', SWITCH: 'Switch', RATHER_MAS: 'Rather masochistic',
      MAS: 'Masochistic',
    },
    zodiacSign: {
      ARIES: 'Aries', TAURUS: 'Taurus', GEMINI: 'Gemini', CANCER: 'Cancer', LEO: 'Leo', VIRGO: 'Virgo', LIBRA: 'Libra',
      SCORPIO: 'Scorpio', SAGITTARIUS: 'Sagittarius', CAPRICORN: 'Capricorn', AQUARIUS: 'Aquarius', PISCES: 'Pisces',
    },
  },
  ratings: {
    ABSOLUTELY: 'Absolutely', LIKE: 'I’m into it', DEPENDS: 'Depends on the situation', DISLIKE: 'Not for me',
    ABSOLUTELY_NOT: 'No way', TRY_OUT: 'I’d like to try it',
  },
  preferenceKeys: {
    ANLSX: 'Anal sex', BDS: 'S&M, BDSM', BJ: 'Blowjob', BLINDFOLD: 'Blindfolding', BODY_HAIR: 'Body hair',
    BOND: 'Bondage, restraints', CCKLDNG: 'Cuckolding', CHATS: 'Erotic chats', CHUBBY: 'Chubby', CORSETS: 'Corsets and bustiers',
    CUDDLINGSX: 'Cuddling sex', CUNNI: 'Cunnilingus', DESSOUS: 'Lingerie', DRTY_TALK: 'Dirty talk', EXHIBI: 'Exhibitionism',
    FEET: 'Foot eroticism', FETI: 'Fetish', FFM: 'FFM threesome', FILMING: 'Filming', FKK: 'Naturism',
    FRI_PARTIES: 'Revealing clothing in public', FSTNG: 'Fisting', GANG: 'Gangbang', GROUPSX: 'Group sex', HAND: 'Handjob',
    HIGH_HEELS: 'High heels', INT_HAIR: 'Pubic hair', INT_JEWELRY: 'Intimate jewellery', INT_SHAVE: 'Intimate shaving',
    KAMASUTRA: 'Kama Sutra', KISSING: 'Kissing', LATEX: 'PVC, leather and latex', LET_WATCH: 'Being watched',
    MASSAGES: 'Massage', MAST: 'Masturbation', MFMF: 'MFMF couples sex', MMF: 'MMF threesome', NORMALSX: 'Normal sex',
    NYLONS: 'Nylons', NYM: 'Nymphomania', OLDER_THAN_ME: 'Older', OUTDOOR: 'Outdoors', PHOTO: 'Photography',
    PI: 'Golden showers', PICTURE_EXCHANGE: 'Picture exchange', PIERCINGS: 'Piercings', PRN: 'Porn', RIM: 'Rimming',
    ROLE_PLAY: 'Role play', ROUGHSX: 'Rough sex', SLIM: 'Slim', SLOWSX: 'Slow sex', SPECIAL_PLACES: 'Special places',
    SPNK: 'Spanking', SPRM: 'Cum play', SQURT: 'Squirting', STRAPSX: 'Strap-on sex', STRP: 'Striptease', TATTOOS: 'Tattoos',
    TELEPHONESX: 'Phone sex', TNTRA: 'Tantra', TOYS: 'Sex toys', WATCH: 'Voyeurism', WEBCAM: 'Webcam',
    W_SHARING: 'Wifesharing', YOUNGER_THAN_ME: 'Younger',
  },
};

function isPresent(value) {
  return value !== null && value !== undefined;
}

// → { properties: { field: raw value }, preferences: [{ key, rating }] } or null when the person has nothing set.
function personData(properties, interests, preferences) {
  const values = { ...properties, ...interests };
  const fields = PROPERTY_FIELDS.filter((field) => isPresent(values[field])).map((field) => [field, values[field]]);
  const rated = (Array.isArray(preferences) ? preferences : [])
    .filter((preference) => typeof preference?.key === 'string' && typeof preference.rating === 'string' && preference.rating !== NOT_RATED)
    .map(({ key, rating }) => ({ key, rating }));
  return fields.length > 0 || rated.length > 0 ? { properties: Object.fromEntries(fields), preferences: rated } : null;
}

// profileDescription.byUserId of the sed card query → { primary, partner } (each null when unset), language-independent,
// also the fingerprint input; null for an error answer, a failed request or an empty card.
export function sedCardData(raw) {
  if (raw?.__typename !== PROFILE_DESCRIPTION) {
    return null;
  }
  const properties = raw.properties?.__typename === USER_PROPERTIES ? raw.properties : {};
  const primary = personData(properties.individualProperties, raw.interests?.individualInterests, raw.preferences?.primaryPreferences);
  const partner = personData(
    properties.individualPropertiesPartner, raw.interests?.individualInterestsPartner, raw.preferences?.partnerPreferences,
  );
  return primary || partner ? { primary, partner } : null;
}

function pronouns(gender, table) {
  if (SHE_HE_GENDERS.has(gender)) return table.pronouns.sheHe;
  if (HE_HE_GENDERS.has(gender)) return table.pronouns.heHe;
  if (SHE_SHE_GENDERS.has(gender)) return table.pronouns.sheShe;
  return table.pronouns.other;
}

function propertyValue(field, value, table) {
  if (UNITS[field]) return `${value} ${UNITS[field]}`;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return table.values[field]?.[text] ?? text;
}

function preferenceGroups(preferences, table) {
  const ratings = [...RATING_ORDER, ...new Set(preferences.map(({ rating }) => rating).filter((rating) => !RATING_ORDER.includes(rating)))];
  return ratings
    .map((rating) => ({
      rating: table.ratings[rating] ?? rating,
      items: preferences.filter((preference) => preference.rating === rating)
        .map(({ key }) => table.preferenceKeys[key] ?? key)
        .sort((a, b) => a.localeCompare(b, table.locale)),
    }))
    .filter(({ items }) => items.length > 0);
}

// data from sedCardData; language: the page's <html lang> (English table for "en…", German otherwise);
// gender: the profile's universal gender, or null when unknown (then a couple is a profile with partner data).
// → { title, preferencesTitle, persons: [{ label (null on a single profile), properties: [{ label, value }],
//     preferences: [{ rating, items }] }] } or null.
export function toSedCard(data, { language, gender } = {}) {
  if (!data) {
    return null;
  }
  const table = ENGLISH.test(language ?? '') ? ENGLISH_TABLE : GERMAN;
  const couple = Number.isInteger(gender) ? COUPLE_GENDERS.has(gender) : Boolean(data.partner);
  const people = couple ? [data.primary, data.partner] : [data.primary];
  const labels = couple ? pronouns(gender, table) : [null];
  const persons = people.flatMap((person, index) => (person ? [{
    label: labels[index],
    properties: Object.entries(person.properties)
      .map(([field, value]) => ({ label: table.labels[field] ?? field, value: propertyValue(field, value, table) })),
    preferences: preferenceGroups(person.preferences, table),
  }] : []));
  return persons.length > 0 ? { title: table.sedCard, preferencesTitle: table.preferences, persons } : null;
}
