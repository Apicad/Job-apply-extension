/**
 * Places: US states and territories, and the countries of the world, with the
 * names and codes that people and forms write them by. Data and lookups only.
 *
 *   stateCode('AL - Alabama')    -> 'AL'   what a state field or option says
 *   countryCode('U.S.A.')        -> 'US'   what a country field or option says
 *   findCountry('... work in the UK?') -> 'GB'   the country a question is about
 *   findCountries('... in the UK or the EU?') -> ['GB', 'several']   every place it names
 *
 * Everything here compares whole words. Looking for letters inside a text
 * finds "us" in "focus", India in "Indiana" and Kansas in "Arkansas".
 */
import type { CountryCode, FindCountry } from './types';

// ---------------------------------------------------------------------------
// Text to words
// ---------------------------------------------------------------------------

/** One word of a text, plus whether it was written in capitals ("US", not "us"). */
interface Word {
  word: string;
  capitals: boolean;
}

/**
 * The accents NFKD splits off Latin, Greek and Cyrillic letters: the acute of
 * "é", the cedilla of "ç". People leave these out ("Cote d'Ivoire"). The marks
 * of other scripts stay, because there they spell another word: the vowel
 * signs of Hindi and Thai, the voicing marks of Japanese ("ば" and "ぱ").
 */
const ACCENTS = /[\u0300-\u036f]+/g;
/** Typographic apostrophes; forms write both "don’t" and "don't". */
const CURLY_APOSTROPHES = /[‘’‚‛ʼ′`´]/g;
/** Single letters with full stops between them: "U.S.", "u.s.a.", "D.C". Not "Ph.D." or "St.". */
const DOTTED_INITIALS = /(?<![\p{L}\p{N}])\p{L}(?:\.\p{L})+(?![\p{L}\p{N}])\.?/gu;
/**
 * A word starts with a letter or a digit and goes on with letters, digits and
 * the marks that sit on them; an apostrophe inside it belongs to it ("don't").
 */
const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}']*/gu;

function split(text: string): Word[] {
  const plain = text
    // NFKD turns full-width letters, ligatures and non-breaking spaces into
    // ordinary ones and separates accents from their letters.
    .normalize('NFKD')
    .replace(ACCENTS, '')
    .replace(CURLY_APOSTROPHES, "'")
    // "U.S." must stay one word, or the full stops would cut it into "u" and "s".
    .replace(DOTTED_INITIALS, (initials) => initials.replaceAll('.', '').toUpperCase())
    // "Trinidad & Tobago" and "Trinidad and Tobago" are the same place.
    .replaceAll('&', ' and ');

  const found: Word[] = [];
  for (const match of plain.match(WORD) ?? []) {
    // A quote after a word is punctuation, not part of it ('Yes').
    const raw = match.replace(/'+$/, '');
    const word = raw.toLowerCase();
    found.push({ word, capitals: raw === raw.toUpperCase() && raw !== word });
  }
  return found;
}

/**
 * The lower-case words of a text: accents and punctuation dropped, hyphens
 * and slashes read as spaces. Two texts are "the same" when their words are.
 */
export function words(text: string): string[] {
  return split(text).map((entry) => entry.word);
}

// ---------------------------------------------------------------------------
// Looking a place up
// ---------------------------------------------------------------------------

/**
 * The words of a place name. "The" and "St." change from form to form ("The
 * Bahamas", "Bahamas (the)", "St. Lucia", "Saint Lucia"), so they are evened out.
 */
function placeWords(text: string): Word[] {
  return split(text)
    .filter((entry) => entry.word !== 'the')
    .map((entry) => (entry.word === 'st' ? { word: 'saint', capitals: entry.capitals } : entry));
}

function placeKey(text: string): string {
  return placeWords(text)
    .map((entry) => entry.word)
    .join(' ');
}

/** Every spelling in every row, as words, pointing at the row's code (its first entry). */
function spellings(rows: readonly (readonly [string, ...string[]])[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    for (const spelling of row) index.set(placeKey(spelling), row[0]);
  }
  return index;
}

/** What forms put between two spellings of one place: "AL - Alabama", "Alabama (AL)". */
const BETWEEN_SPELLINGS = /[()[\],;:/|–—-]/;

/**
 * The code of the place a value names, or null. The value must be one
 * spelling from the index, or several spellings of the same place.
 */
function codeOf(value: string, index: ReadonlyMap<string, string>): string | null {
  const whole = index.get(placeKey(value));
  if (whole !== undefined) return whole;

  const parts = value
    .split(BETWEEN_SPELLINGS)
    .map(placeKey)
    .filter((part) => part !== '');
  let code: string | null = null;
  for (const part of parts) {
    const found = index.get(part);
    // Every part must be the same place: "CA - Alabama" names two, "Portland, OR" a city.
    if (found === undefined || (code !== null && found !== code)) return null;
    code = found;
  }
  return code;
}

// ---------------------------------------------------------------------------
// US states and territories
// ---------------------------------------------------------------------------

/** USPS code, name, then other ways the place is written. */
export type StateRow = readonly [code: string, name: string, ...otherNames: string[]];

export const US_STATES: readonly StateRow[] = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia', 'Washington DC'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii', "Hawai'i"],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York', 'New York State'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington', 'Washington State'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
  // Territories: they have USPS codes and appear in state lists.
  ['AS', 'American Samoa'],
  ['GU', 'Guam'],
  ['MP', 'Northern Mariana Islands'],
  ['PR', 'Puerto Rico'],
  ['VI', 'U.S. Virgin Islands', 'Virgin Islands', 'United States Virgin Islands'],
];

const STATE_SPELLINGS = spellings(US_STATES);

/**
 * The USPS code of the US state or territory a value names: "CA" for
 * "California", "ca" and "CA - California". Null when the value is anything
 * else, including a state plus other words ("Kansas City").
 */
export function stateCode(value: string): string | null {
  return codeOf(value, STATE_SPELLINGS);
}

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

/**
 * ISO 3166-1 alpha-2 code, alpha-3 code, the usual English name, then other
 * ways the country is written.
 */
export type CountryRow = readonly [code: string, alpha3: string, name: string, ...otherNames: string[]];

export const COUNTRIES: readonly CountryRow[] = [
  ['AD', 'AND', 'Andorra'],
  ['AE', 'ARE', 'United Arab Emirates', 'UAE'],
  ['AF', 'AFG', 'Afghanistan'],
  ['AG', 'ATG', 'Antigua and Barbuda'],
  ['AI', 'AIA', 'Anguilla'],
  ['AL', 'ALB', 'Albania'],
  ['AM', 'ARM', 'Armenia'],
  ['AO', 'AGO', 'Angola'],
  ['AQ', 'ATA', 'Antarctica'],
  ['AR', 'ARG', 'Argentina'],
  ['AS', 'ASM', 'American Samoa'],
  ['AT', 'AUT', 'Austria'],
  ['AU', 'AUS', 'Australia'],
  ['AW', 'ABW', 'Aruba'],
  ['AX', 'ALA', 'Åland Islands', 'Åland'],
  ['AZ', 'AZE', 'Azerbaijan'],
  ['BA', 'BIH', 'Bosnia and Herzegovina', 'Bosnia-Herzegovina', 'Bosnia'],
  ['BB', 'BRB', 'Barbados'],
  ['BD', 'BGD', 'Bangladesh'],
  ['BE', 'BEL', 'Belgium'],
  ['BF', 'BFA', 'Burkina Faso'],
  ['BG', 'BGR', 'Bulgaria'],
  ['BH', 'BHR', 'Bahrain'],
  ['BI', 'BDI', 'Burundi'],
  ['BJ', 'BEN', 'Benin'],
  ['BL', 'BLM', 'Saint Barthélemy'],
  ['BM', 'BMU', 'Bermuda'],
  ['BN', 'BRN', 'Brunei', 'Brunei Darussalam'],
  ['BO', 'BOL', 'Bolivia', 'Plurinational State of Bolivia', 'Bolivia, Plurinational State of'],
  ['BQ', 'BES', 'Caribbean Netherlands', 'Bonaire, Sint Eustatius and Saba', 'Bonaire'],
  ['BR', 'BRA', 'Brazil'],
  ['BS', 'BHS', 'Bahamas'],
  ['BT', 'BTN', 'Bhutan'],
  ['BV', 'BVT', 'Bouvet Island'],
  ['BW', 'BWA', 'Botswana'],
  ['BY', 'BLR', 'Belarus'],
  ['BZ', 'BLZ', 'Belize'],
  ['CA', 'CAN', 'Canada'],
  ['CC', 'CCK', 'Cocos (Keeling) Islands', 'Cocos Islands', 'Keeling Islands'],
  ['CD', 'COD', 'Democratic Republic of the Congo', 'DR Congo', 'DRC', 'Congo, Democratic Republic of the', 'Congo (Kinshasa)', 'Congo (DRC)'],
  ['CF', 'CAF', 'Central African Republic'],
  // "Congo" alone is not listed: somebody from Kinshasa who types it must not be given Brazzaville.
  ['CG', 'COG', 'Republic of the Congo', 'Congo, Republic of the', 'Congo (Brazzaville)', 'Congo Republic'],
  ['CH', 'CHE', 'Switzerland'],
  ['CI', 'CIV', "Côte d'Ivoire", 'Ivory Coast'],
  ['CK', 'COK', 'Cook Islands'],
  ['CL', 'CHL', 'Chile'],
  ['CM', 'CMR', 'Cameroon'],
  ['CN', 'CHN', 'China', "People's Republic of China", 'PRC', 'Mainland China'],
  ['CO', 'COL', 'Colombia'],
  ['CR', 'CRI', 'Costa Rica'],
  ['CU', 'CUB', 'Cuba'],
  ['CV', 'CPV', 'Cabo Verde', 'Cape Verde'],
  ['CW', 'CUW', 'Curaçao'],
  ['CX', 'CXR', 'Christmas Island'],
  ['CY', 'CYP', 'Cyprus'],
  ['CZ', 'CZE', 'Czech Republic', 'Czechia'],
  ['DE', 'DEU', 'Germany'],
  ['DJ', 'DJI', 'Djibouti'],
  ['DK', 'DNK', 'Denmark'],
  ['DM', 'DMA', 'Dominica'],
  ['DO', 'DOM', 'Dominican Republic'],
  ['DZ', 'DZA', 'Algeria'],
  ['EC', 'ECU', 'Ecuador'],
  ['EE', 'EST', 'Estonia'],
  ['EG', 'EGY', 'Egypt'],
  ['EH', 'ESH', 'Western Sahara'],
  ['ER', 'ERI', 'Eritrea'],
  ['ES', 'ESP', 'Spain'],
  ['ET', 'ETH', 'Ethiopia'],
  ['FI', 'FIN', 'Finland'],
  ['FJ', 'FJI', 'Fiji'],
  ['FK', 'FLK', 'Falkland Islands', 'Falkland Islands (Malvinas)'],
  ['FM', 'FSM', 'Micronesia', 'Federated States of Micronesia', 'Micronesia, Federated States of'],
  ['FO', 'FRO', 'Faroe Islands'],
  ['FR', 'FRA', 'France'],
  ['GA', 'GAB', 'Gabon'],
  // England, Scotland, Wales and Northern Ireland are listed so that "Northern
  // Ireland" is never read as Ireland.
  [
    'GB',
    'GBR',
    'United Kingdom',
    'UK',
    'Great Britain',
    'Britain',
    'United Kingdom of Great Britain and Northern Ireland',
    'England',
    'Scotland',
    'Wales',
    'Northern Ireland',
  ],
  ['GD', 'GRD', 'Grenada'],
  ['GE', 'GEO', 'Georgia', 'Republic of Georgia'],
  ['GF', 'GUF', 'French Guiana'],
  ['GG', 'GGY', 'Guernsey'],
  ['GH', 'GHA', 'Ghana'],
  ['GI', 'GIB', 'Gibraltar'],
  ['GL', 'GRL', 'Greenland'],
  ['GM', 'GMB', 'Gambia'],
  ['GN', 'GIN', 'Guinea'],
  ['GP', 'GLP', 'Guadeloupe'],
  ['GQ', 'GNQ', 'Equatorial Guinea'],
  ['GR', 'GRC', 'Greece'],
  ['GS', 'SGS', 'South Georgia and the South Sandwich Islands', 'South Georgia'],
  ['GT', 'GTM', 'Guatemala'],
  ['GU', 'GUM', 'Guam'],
  ['GW', 'GNB', 'Guinea-Bissau'],
  ['GY', 'GUY', 'Guyana'],
  ['HK', 'HKG', 'Hong Kong', 'Hong Kong SAR', 'Hong Kong SAR China'],
  ['HM', 'HMD', 'Heard Island and McDonald Islands', 'Heard and McDonald Islands'],
  ['HN', 'HND', 'Honduras'],
  ['HR', 'HRV', 'Croatia'],
  ['HT', 'HTI', 'Haiti'],
  ['HU', 'HUN', 'Hungary'],
  ['ID', 'IDN', 'Indonesia'],
  ['IE', 'IRL', 'Ireland', 'Republic of Ireland'],
  ['IL', 'ISR', 'Israel'],
  ['IM', 'IMN', 'Isle of Man'],
  ['IN', 'IND', 'India'],
  ['IO', 'IOT', 'British Indian Ocean Territory'],
  ['IQ', 'IRQ', 'Iraq'],
  ['IR', 'IRN', 'Iran', 'Islamic Republic of Iran', 'Iran, Islamic Republic of'],
  ['IS', 'ISL', 'Iceland'],
  ['IT', 'ITA', 'Italy'],
  ['JE', 'JEY', 'Jersey'],
  ['JM', 'JAM', 'Jamaica'],
  ['JO', 'JOR', 'Jordan'],
  ['JP', 'JPN', 'Japan'],
  ['KE', 'KEN', 'Kenya'],
  ['KG', 'KGZ', 'Kyrgyzstan', 'Kyrgyz Republic'],
  ['KH', 'KHM', 'Cambodia'],
  ['KI', 'KIR', 'Kiribati'],
  ['KM', 'COM', 'Comoros'],
  ['KN', 'KNA', 'Saint Kitts and Nevis'],
  ['KP', 'PRK', 'North Korea', "Democratic People's Republic of Korea", "Korea, Democratic People's Republic of", 'DPRK', 'Korea, North'],
  ['KR', 'KOR', 'South Korea', 'Republic of Korea', 'Korea, Republic of', 'Korea, South', 'Korea'],
  ['KW', 'KWT', 'Kuwait'],
  ['KY', 'CYM', 'Cayman Islands'],
  ['KZ', 'KAZ', 'Kazakhstan'],
  ['LA', 'LAO', 'Laos', "Lao People's Democratic Republic", 'Lao PDR'],
  ['LB', 'LBN', 'Lebanon'],
  ['LC', 'LCA', 'Saint Lucia'],
  ['LI', 'LIE', 'Liechtenstein'],
  ['LK', 'LKA', 'Sri Lanka'],
  ['LR', 'LBR', 'Liberia'],
  ['LS', 'LSO', 'Lesotho'],
  ['LT', 'LTU', 'Lithuania'],
  ['LU', 'LUX', 'Luxembourg'],
  ['LV', 'LVA', 'Latvia'],
  ['LY', 'LBY', 'Libya'],
  ['MA', 'MAR', 'Morocco'],
  ['MC', 'MCO', 'Monaco'],
  ['MD', 'MDA', 'Moldova', 'Republic of Moldova', 'Moldova, Republic of'],
  ['ME', 'MNE', 'Montenegro'],
  ['MF', 'MAF', 'Saint Martin', 'Saint Martin (French part)'],
  ['MG', 'MDG', 'Madagascar'],
  ['MH', 'MHL', 'Marshall Islands'],
  ['MK', 'MKD', 'North Macedonia', 'Macedonia', 'Republic of North Macedonia', 'Macedonia, the Former Yugoslav Republic of'],
  ['ML', 'MLI', 'Mali'],
  ['MM', 'MMR', 'Myanmar', 'Burma', 'Myanmar (Burma)'],
  ['MN', 'MNG', 'Mongolia'],
  ['MO', 'MAC', 'Macau', 'Macao', 'Macau SAR', 'Macao SAR China'],
  ['MP', 'MNP', 'Northern Mariana Islands'],
  ['MQ', 'MTQ', 'Martinique'],
  ['MR', 'MRT', 'Mauritania'],
  ['MS', 'MSR', 'Montserrat'],
  ['MT', 'MLT', 'Malta'],
  ['MU', 'MUS', 'Mauritius'],
  ['MV', 'MDV', 'Maldives'],
  ['MW', 'MWI', 'Malawi'],
  ['MX', 'MEX', 'Mexico'],
  ['MY', 'MYS', 'Malaysia'],
  ['MZ', 'MOZ', 'Mozambique'],
  ['NA', 'NAM', 'Namibia'],
  ['NC', 'NCL', 'New Caledonia'],
  ['NE', 'NER', 'Niger'],
  ['NF', 'NFK', 'Norfolk Island'],
  ['NG', 'NGA', 'Nigeria'],
  ['NI', 'NIC', 'Nicaragua'],
  ['NL', 'NLD', 'Netherlands', 'Holland'],
  ['NO', 'NOR', 'Norway'],
  ['NP', 'NPL', 'Nepal'],
  ['NR', 'NRU', 'Nauru'],
  ['NU', 'NIU', 'Niue'],
  ['NZ', 'NZL', 'New Zealand'],
  ['OM', 'OMN', 'Oman'],
  ['PA', 'PAN', 'Panama'],
  ['PE', 'PER', 'Peru'],
  ['PF', 'PYF', 'French Polynesia'],
  ['PG', 'PNG', 'Papua New Guinea'],
  ['PH', 'PHL', 'Philippines'],
  ['PK', 'PAK', 'Pakistan'],
  ['PL', 'POL', 'Poland'],
  ['PM', 'SPM', 'Saint Pierre and Miquelon'],
  ['PN', 'PCN', 'Pitcairn Islands', 'Pitcairn'],
  ['PR', 'PRI', 'Puerto Rico'],
  ['PS', 'PSE', 'Palestine', 'State of Palestine', 'Palestine, State of', 'Palestinian Territories', 'Palestinian Territory'],
  ['PT', 'PRT', 'Portugal'],
  ['PW', 'PLW', 'Palau'],
  ['PY', 'PRY', 'Paraguay'],
  ['QA', 'QAT', 'Qatar'],
  ['RE', 'REU', 'Réunion'],
  ['RO', 'ROU', 'Romania'],
  ['RS', 'SRB', 'Serbia'],
  ['RU', 'RUS', 'Russia', 'Russian Federation'],
  ['RW', 'RWA', 'Rwanda'],
  ['SA', 'SAU', 'Saudi Arabia'],
  ['SB', 'SLB', 'Solomon Islands'],
  ['SC', 'SYC', 'Seychelles'],
  ['SD', 'SDN', 'Sudan'],
  ['SE', 'SWE', 'Sweden'],
  ['SG', 'SGP', 'Singapore'],
  ['SH', 'SHN', 'Saint Helena', 'Saint Helena, Ascension and Tristan da Cunha'],
  ['SI', 'SVN', 'Slovenia'],
  ['SJ', 'SJM', 'Svalbard and Jan Mayen'],
  ['SK', 'SVK', 'Slovakia', 'Slovak Republic'],
  ['SL', 'SLE', 'Sierra Leone'],
  ['SM', 'SMR', 'San Marino'],
  ['SN', 'SEN', 'Senegal'],
  ['SO', 'SOM', 'Somalia'],
  ['SR', 'SUR', 'Suriname'],
  ['SS', 'SSD', 'South Sudan'],
  ['ST', 'STP', 'São Tomé and Príncipe'],
  ['SV', 'SLV', 'El Salvador'],
  ['SX', 'SXM', 'Sint Maarten', 'Sint Maarten (Dutch part)', 'Saint Maarten'],
  ['SY', 'SYR', 'Syria', 'Syrian Arab Republic'],
  ['SZ', 'SWZ', 'Eswatini', 'Swaziland'],
  ['TC', 'TCA', 'Turks and Caicos Islands', 'Turks and Caicos'],
  ['TD', 'TCD', 'Chad'],
  ['TF', 'ATF', 'French Southern Territories'],
  ['TG', 'TGO', 'Togo'],
  ['TH', 'THA', 'Thailand'],
  ['TJ', 'TJK', 'Tajikistan'],
  ['TK', 'TKL', 'Tokelau'],
  ['TL', 'TLS', 'Timor-Leste', 'East Timor'],
  ['TM', 'TKM', 'Turkmenistan'],
  ['TN', 'TUN', 'Tunisia'],
  ['TO', 'TON', 'Tonga'],
  ['TR', 'TUR', 'Turkey', 'Türkiye'],
  ['TT', 'TTO', 'Trinidad and Tobago'],
  ['TV', 'TUV', 'Tuvalu'],
  ['TW', 'TWN', 'Taiwan', 'Taiwan, Province of China'],
  ['TZ', 'TZA', 'Tanzania', 'United Republic of Tanzania', 'Tanzania, United Republic of'],
  ['UA', 'UKR', 'Ukraine'],
  ['UG', 'UGA', 'Uganda'],
  ['UM', 'UMI', 'United States Minor Outlying Islands', 'US Minor Outlying Islands', 'U.S. Outlying Islands'],
  // "US" and "USA" are repeated as names: unlike most codes, people write them in sentences.
  ['US', 'USA', 'United States', 'United States of America', 'US', 'USA', 'America'],
  ['UY', 'URY', 'Uruguay'],
  ['UZ', 'UZB', 'Uzbekistan'],
  ['VA', 'VAT', 'Vatican City', 'Vatican', 'Vatican City State', 'Holy See', 'Holy See (Vatican City State)'],
  ['VC', 'VCT', 'Saint Vincent and the Grenadines', 'Saint Vincent'],
  ['VE', 'VEN', 'Venezuela', 'Bolivarian Republic of Venezuela', 'Venezuela, Bolivarian Republic of'],
  ['VG', 'VGB', 'British Virgin Islands', 'Virgin Islands, British'],
  ['VI', 'VIR', 'U.S. Virgin Islands', 'United States Virgin Islands', 'Virgin Islands, U.S.'],
  ['VN', 'VNM', 'Vietnam', 'Viet Nam'],
  ['VU', 'VUT', 'Vanuatu'],
  ['WF', 'WLF', 'Wallis and Futuna'],
  ['WS', 'WSM', 'Samoa', 'Western Samoa'],
  // Not an ISO country yet; forms list it and XK is the code in common use.
  ['XK', 'XKX', 'Kosovo'],
  ['YE', 'YEM', 'Yemen'],
  ['YT', 'MYT', 'Mayotte'],
  ['ZA', 'ZAF', 'South Africa'],
  ['ZM', 'ZMB', 'Zambia'],
  ['ZW', 'ZWE', 'Zimbabwe'],
];

const COUNTRY_SPELLINGS = spellings(COUNTRIES);

/**
 * The code of the country a value names, the way a profile or an option list
 * writes one: a name, an abbreviation or an ISO code, in any case. The whole
 * value must be the country: "about us" and "United States or Canada" are null.
 */
export const countryCode: CountryCode = (value) => codeOf(value, COUNTRY_SPELLINGS);

// ---------------------------------------------------------------------------
// Countries named in a sentence
// ---------------------------------------------------------------------------

/**
 * What findCountries lists for a part of the world that is no single country:
 * a continent, or a union such as the EU. It is never the code of a country,
 * so "authorized to work in the EU?" is taken neither for a question about no
 * place at all nor for one about the country the user lives in.
 */
export const SEVERAL_COUNTRIES = 'several';

/**
 * Names that need a reading of their own when they stand in a sentence, with
 * what they stand for there.
 */
const READ_IN_SENTENCES: readonly (readonly [name: string, code: string])[] = [
  // "America" alone is the United States; with a word in front it is a continent.
  ['North America', SEVERAL_COUNTRIES],
  ['South America', SEVERAL_COUNTRIES],
  ['Latin America', SEVERAL_COUNTRIES],
  ['Central America', SEVERAL_COUNTRIES],
  ['Americas', SEVERAL_COUNTRIES],
  ['LATAM', SEVERAL_COUNTRIES],
  // "Do you have the right to work in the EU?" is asked for jobs all over Europe.
  // "European" also covers "European Union" and "European Economic Area".
  ['Europe', SEVERAL_COUNTRIES],
  ['European', SEVERAL_COUNTRIES],
  ['EU', SEVERAL_COUNTRIES],
  ['EEA', SEVERAL_COUNTRIES],
  ['Schengen', SEVERAL_COUNTRIES],
  ['Asia', SEVERAL_COUNTRIES],
  ['APAC', SEVERAL_COUNTRIES],
  ['Africa', SEVERAL_COUNTRIES],
  ['Middle East', SEVERAL_COUNTRIES],
  ['EMEA', SEVERAL_COUNTRIES],
  ['Oceania', SEVERAL_COUNTRIES],
  ['Caribbean', SEVERAL_COUNTRIES],
  // They hold the name of a country and lie in another one.
  ['New England', 'US'],
  ['New South Wales', 'AU'],
  ['State of Georgia', 'US'],
  // Which of the two Congos is not known, but a country is named, and the
  // question is about that country, not about the reader's own.
  ['Congo', 'CG'],
];

/** "Georgia" is a US state and a country; which one is decided once the whole sentence is read. */
const GEORGIA = '?';

/** Every name a sentence may use for a country, as words. ISO codes are left out: "IN", "IT" and "CAN" are words. */
const NAMES_IN_SENTENCES = new Map<string, string>();

/**
 * The one abbreviation that is also an ordinary word: "us" in "about us" is a
 * pronoun, so it names the country only in capitals ("US", "U.S."). The others
 * ("uk", "usa", "uae", "eu") are nothing else, however they are typed, and a
 * question about the UK that goes unnoticed gets the user's answer for home.
 */
const NEEDS_CAPITALS = 'us';

// A US state names the United States: "authorized to work in California".
for (const [, ...names] of US_STATES) {
  for (const name of names) NAMES_IN_SENTENCES.set(placeKey(name), 'US');
}
// Countries go in after the states, so Puerto Rico and Guam keep their own ISO codes.
for (const [code, , ...names] of COUNTRIES) {
  for (const name of names) NAMES_IN_SENTENCES.set(placeKey(name), code);
}
for (const [name, code] of READ_IN_SENTENCES) NAMES_IN_SENTENCES.set(placeKey(name), code);
NAMES_IN_SENTENCES.set('georgia', GEORGIA);

const LONGEST_NAME = Math.max(...[...NAMES_IN_SENTENCES.keys()].map((key) => key.split(' ').length));

/**
 * A small "uk" or "eu" straight after a full stop is the end of a web or an
 * e-mail address ("www.example.co.uk", "jobs@example.eu"), not a place.
 */
const ADDRESS_ENDING = /\.(?:uk|eu)\b/g;

/**
 * The code of every country a text names, in the order they appear, each
 * once. A US state counts as the United States, and a continent or a union of
 * countries is listed as SEVERAL_COUNTRIES.
 *
 * An empty list means "no place this table knows", which is not quite "no
 * place": a city ("London") or a nationality ("Canadian") is not recognised.
 */
export function findCountries(text: string): string[] {
  const all = placeWords(text.replace(ADDRESS_ENDING, ' '));
  const mentions: string[] = [];
  let at = 0;
  while (at < all.length) {
    let taken = 1;
    // A name is read from its first word, so "New Mexico" is never Mexico, and
    // the longest name wins, so "Guinea-Bissau" is never Guinea.
    for (let length = Math.min(LONGEST_NAME, all.length - at); length >= 1; length--) {
      const run = all.slice(at, at + length);
      const key = run.map((entry) => entry.word).join(' ');
      const code = NAMES_IN_SENTENCES.get(key);
      if (code === undefined) continue;
      // "us" in "about us" is a pronoun; "US" is a country.
      if (key === NEEDS_CAPITALS && !run.every((entry) => entry.capitals)) continue;
      mentions.push(code);
      taken = length;
      break;
    }
    at += taken;
  }

  // Alone, "Georgia" is read as the country: somebody in the US must not be
  // answered for a job in Tbilisi. Next to the United States or another state
  // ("Atlanta, Georgia ... work in the United States") it is the state.
  const georgia = mentions.includes('US') ? 'US' : 'GE';
  const codes = mentions.map((code) => (code === GEORGIA ? georgia : code));
  return [...new Set(codes)];
}

/**
 * The code of the one country a text names, or null when it names none or
 * more than one (a continent or a union of countries is more than one).
 * Callers that must tell "none" from "several" use findCountries: the two call
 * for opposite things, the user's own answer and no answer at all.
 */
export const findCountry: FindCountry = (text) => {
  const [only, ...others] = findCountries(text);
  return only !== undefined && only !== SEVERAL_COUNTRIES && others.length === 0 ? only : null;
};
