// @vitest-environment node
//
// lib/regions.ts is data and lookups: no DOM. Running without one makes a
// stray `document` fail here.
import { describe, expect, it } from 'vitest';
import { COUNTRIES, US_STATES, countryCode, findCountries, findCountry, stateCode, words } from '../../lib/regions';

describe('words', () => {
  const table: [why: string, text: string, want: string[]][] = [
    ['a hyphen separates words', 'Non-binary', ['non', 'binary']],
    ['spaces around a value do not count (real options read "Yes ")', '  Yes ', ['yes']],
    ['a slash separates words', 'Black/African American', ['black', 'african', 'american']],
    ['a curly apostrophe is an apostrophe', 'No, I don’t have a disability', ['no', 'i', "don't", 'have', 'a', 'disability']],
    ['accents do not count', 'Côte d’Ivoire', ['cote', "d'ivoire"]],
    ['"&" reads "and"', 'Trinidad & Tobago', ['trinidad', 'and', 'tobago']],
    ['dotted initials are one word', 'U.S.', ['us']],
    ['three dotted initials', 'U.S.A.', ['usa']],
    ['initials after a comma', 'Washington, D.C.', ['washington', 'dc']],
    ['initials without the last full stop', 'U.S citizens', ['us', 'citizens']],
    ['a full stop after a longer word just ends it', 'St. John’s University', ['st', "john's", 'university']],
    ['"Ph.D." is not a row of initials', 'Ph.D.', ['ph', 'd']],
    ['full-width letters are ordinary letters', 'ＵＳＡ', ['usa']],
    ['a non-breaking space is a space', 'United States', ['united', 'states']],
    ['digits are kept', '05/2027', ['05', '2027']],
    ['curly quotes around a word are dropped', '“Yes”', ['yes']],
    ['straight quotes around a word are dropped', "'Yes'", ['yes']],
    ['an empty text has no words', '', []],
    ['dashes alone are no words', '--', []],
  ];

  it.each(table)('%s', (_why, text, want) => {
    expect(words(text)).toEqual(want);
  });
});

describe('stateCode', () => {
  const known: [value: string, want: string][] = [
    ['California', 'CA'],
    ['CA', 'CA'],
    // A profile is typed by hand: any case, stray spaces.
    ['ca', 'CA'],
    ['  california ', 'CA'],
    ['NEW YORK', 'NY'],
    ['New York', 'NY'],
    // Lever writes its state options as "AL - Alabama".
    ['AL - Alabama', 'AL'],
    ['AK - Alaska', 'AK'],
    ['IL - Illinois', 'IL'],
    ['Alabama (AL)', 'AL'],
    ['New York, NY', 'NY'],
    // Names that sit inside other names, or that other places share.
    ['Kansas', 'KS'],
    ['Arkansas', 'AR'],
    ['Virginia', 'VA'],
    ['West Virginia', 'WV'],
    ['Indiana', 'IN'],
    ['IN', 'IN'],
    ['Georgia', 'GA'],
    ['Washington', 'WA'],
    ['Washington State', 'WA'],
    // The capital is not the state of Washington.
    ['District of Columbia', 'DC'],
    ['Washington, D.C.', 'DC'],
    ['Washington DC', 'DC'],
    ['D.C.', 'DC'],
    // Territories have postal codes too.
    ['Puerto Rico', 'PR'],
    ['Guam', 'GU'],
    ['U.S. Virgin Islands', 'VI'],
    ['American Samoa', 'AS'],
    ['Northern Mariana Islands', 'MP'],
  ];

  it.each(known)('%s is %s', (value, want) => {
    expect(stateCode(value)).toBe(want);
  });

  const unknown: [why: string, value: string][] = [
    ['an empty value', ''],
    ['only spaces', '   '],
    ['a Canadian province', 'Ontario'],
    ['a country', 'United States'],
    ['India, which is not Indiana', 'India'],
    ['a city that starts with a state', 'Kansas City'],
    ['a city and a state', 'Portland, OR'],
    ['half of a name', 'New'],
    ['the other half', 'York'],
    ['the start of a name', 'Californi'],
    ['three letters', 'CAL'],
    ['two states in one value', 'CA - Alabama'],
    ['two states joined by "or"', 'California or Texas'],
    ['a state and something else in brackets', 'Georgia (country)'],
    ['a placeholder', 'Select...'],
    ['"Other"', 'Other'],
  ];

  it.each(unknown)('gives null for %s', (_why, value) => {
    expect(stateCode(value)).toBe(null);
  });
});

describe('US_STATES', () => {
  // Typed here from the USPS list, not copied from the module: 50 states,
  // the District of Columbia and five territories.
  const USPS =
    'AK AL AR AS AZ CA CO CT DC DE FL GA GU HI IA ID IL IN KS KY LA MA MD ME MI MN MO MP MS MT ' +
    'NC ND NE NH NJ NM NV NY OH OK OR PA PR RI SC SD TN TX UT VA VI VT WA WI WV WY';

  it('lists every USPS code once', () => {
    expect(US_STATES.map(([code]) => code).sort()).toEqual(USPS.split(' '));
  });

  // Two rows sharing a name would make one of them unreachable.
  it.each(US_STATES.map(([code, ...names]) => [code, names] as const))('%s is found under each of its names', (code, names) => {
    expect(stateCode(code)).toBe(code);
    for (const name of names) expect(stateCode(name)).toBe(code);
  });
});

describe('countryCode', () => {
  const known: [value: string, want: string][] = [
    // The ways a profile or an option list writes the United States.
    ['United States', 'US'],
    ['United States of America', 'US'],
    ['USA', 'US'],
    ['US', 'US'],
    ['us', 'US'],
    ['U.S.', 'US'],
    ['U.S.A.', 'US'],
    ['America', 'US'],
    ['United States (US)', 'US'],
    ['US - United States', 'US'],
    ['United States of America (USA)', 'US'],
    ['United States of America (the)', 'US'],
    // ...and the United Kingdom.
    ['United Kingdom', 'GB'],
    ['UK', 'GB'],
    ['U.K.', 'GB'],
    ['GB', 'GB'],
    ['GBR', 'GB'],
    ['Great Britain', 'GB'],
    ['England', 'GB'],
    ['Northern Ireland', 'GB'],
    // Codes.
    ['DE', 'DE'],
    ['DEU', 'DE'],
    ['IN', 'IN'],
    ['CA', 'CA'],
    // The same country under two names.
    ['Côte d’Ivoire', 'CI'],
    ["Cote d'Ivoire", 'CI'],
    ['Ivory Coast', 'CI'],
    ['Czechia', 'CZ'],
    ['Czech Republic', 'CZ'],
    ['Türkiye', 'TR'],
    ['Turkey', 'TR'],
    ['The Netherlands', 'NL'],
    ['Holland', 'NL'],
    ['Russian Federation', 'RU'],
    ['Viet Nam', 'VN'],
    ['UAE', 'AE'],
    ['North Macedonia', 'MK'],
    ['Swaziland', 'SZ'],
    ['Burma', 'MM'],
    ['Cape Verde', 'CV'],
    ['East Timor', 'TL'],
    ['Hong Kong', 'HK'],
    ['Korea, Republic of', 'KR'],
    ['Republic of Korea', 'KR'],
    ['St. Lucia', 'LC'],
    ['St Kitts & Nevis', 'KN'],
    ['Trinidad & Tobago', 'TT'],
    // Names that sit inside other names: each must find its own country.
    ['Ireland', 'IE'],
    ['Georgia', 'GE'],
    ['India', 'IN'],
    ['Guinea', 'GN'],
    ['Guinea-Bissau', 'GW'],
    ['Equatorial Guinea', 'GQ'],
    ['Papua New Guinea', 'PG'],
    ['Dominica', 'DM'],
    ['Dominican Republic', 'DO'],
    ['Niger', 'NE'],
    ['Nigeria', 'NG'],
    ['Sudan', 'SD'],
    ['South Sudan', 'SS'],
    ['Samoa', 'WS'],
    ['American Samoa', 'AS'],
    ['Congo', 'CG'],
    ['Democratic Republic of the Congo', 'CD'],
    ['United States Minor Outlying Islands', 'UM'],
    ['Puerto Rico', 'PR'],
    ['Kosovo', 'XK'],
    // Spellings from the browser's own region names (Intl.DisplayNames), which country pickers reuse.
    ['Congo - Kinshasa', 'CD'],
    ['Heard & McDonald Islands', 'HM'],
    ['U.S. Outlying Islands', 'UM'],
  ];

  it.each(known)('%s is %s', (value, want) => {
    expect(countryCode(value)).toBe(want);
  });

  const unknown: [why: string, value: string][] = [
    ['an empty value', ''],
    ['"us" the pronoun in a phrase', 'about us'],
    ['a sentence with "us" in it', 'Tell us more'],
    ['"us" inside a word', 'focus'],
    ['Indiana, which is not India', 'Indiana'],
    ['"Indian"', 'Indian'],
    ['New Mexico, which is not Mexico', 'New Mexico'],
    ['New Jersey, which is not Jersey', 'New Jersey'],
    ['a continent', 'Europe'],
    ['North America, which is not "America"', 'North America'],
    ['half of a name', 'United'],
    ['the other half', 'States'],
    ['two countries joined by "or"', 'United States or Canada'],
    ['two countries with a slash', 'Canada / United States'],
    ['two countries with a comma', 'Georgia, US'],
    ['a name two countries share', 'Virgin Islands'],
    ['a country and something else in brackets', 'Ireland (Northern)'],
    ['a region that is not a country (it is on the real Greenhouse list)', 'Crimea'],
    ['"Other"', 'Other'],
    ['"Remote"', 'Remote'],
    ['a placeholder', 'Select a country'],
  ];

  it.each(unknown)('gives null for %s', (_why, value) => {
    expect(countryCode(value)).toBe(null);
  });

  // The options of "Please choose the country in which you are located." on a
  // live Greenhouse form (GitLab, November 2026), in the form's own spelling.
  const GREENHOUSE_LIST = [
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia',
    'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium',
    'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
    'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad',
    'Chile', 'China', 'Colombia', 'Comoros', 'Crimea', 'Democratic Republic of the Congo', 'Republic of the Congo',
    'Costa Rica', "Cote d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica',
    'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini',
    'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
    'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia',
    'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
    'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
    'Lithuania', 'Luxembourg', 'Macedonia', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
    'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
    'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand',
    'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
    'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia',
    'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
    'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore',
    'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
    'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
    'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
    'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States of America', 'Uruguay',
    'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  ];

  it('knows every country on a real Greenhouse list, each under a code of its own', () => {
    const countries = GREENHOUSE_LIST.filter((name) => name !== 'Crimea');
    const codes = countries.map(countryCode);
    expect(countries.filter((_name, i) => codes[i] === null)).toEqual([]);
    // 197 countries, 197 different codes: no two names fall on the same country.
    expect(new Set(codes).size).toBe(197);
  });
});

describe('COUNTRIES', () => {
  // ISO 3166-1 alpha-2:alpha-3 pairs, taken from the operating system's own
  // tables (IANA iso3166.tab and ICU), not from the module under test.
  const ISO = `
    AD:AND AE:ARE AF:AFG AG:ATG AI:AIA AL:ALB AM:ARM AO:AGO AQ:ATA AR:ARG AS:ASM AT:AUT AU:AUS
    AW:ABW AX:ALA AZ:AZE BA:BIH BB:BRB BD:BGD BE:BEL BF:BFA BG:BGR BH:BHR BI:BDI BJ:BEN BL:BLM
    BM:BMU BN:BRN BO:BOL BQ:BES BR:BRA BS:BHS BT:BTN BV:BVT BW:BWA BY:BLR BZ:BLZ CA:CAN CC:CCK
    CD:COD CF:CAF CG:COG CH:CHE CI:CIV CK:COK CL:CHL CM:CMR CN:CHN CO:COL CR:CRI CU:CUB CV:CPV
    CW:CUW CX:CXR CY:CYP CZ:CZE DE:DEU DJ:DJI DK:DNK DM:DMA DO:DOM DZ:DZA EC:ECU EE:EST EG:EGY
    EH:ESH ER:ERI ES:ESP ET:ETH FI:FIN FJ:FJI FK:FLK FM:FSM FO:FRO FR:FRA GA:GAB GB:GBR GD:GRD
    GE:GEO GF:GUF GG:GGY GH:GHA GI:GIB GL:GRL GM:GMB GN:GIN GP:GLP GQ:GNQ GR:GRC GS:SGS GT:GTM
    GU:GUM GW:GNB GY:GUY HK:HKG HM:HMD HN:HND HR:HRV HT:HTI HU:HUN ID:IDN IE:IRL IL:ISR IM:IMN
    IN:IND IO:IOT IQ:IRQ IR:IRN IS:ISL IT:ITA JE:JEY JM:JAM JO:JOR JP:JPN KE:KEN KG:KGZ KH:KHM
    KI:KIR KM:COM KN:KNA KP:PRK KR:KOR KW:KWT KY:CYM KZ:KAZ LA:LAO LB:LBN LC:LCA LI:LIE LK:LKA
    LR:LBR LS:LSO LT:LTU LU:LUX LV:LVA LY:LBY MA:MAR MC:MCO MD:MDA ME:MNE MF:MAF MG:MDG MH:MHL
    MK:MKD ML:MLI MM:MMR MN:MNG MO:MAC MP:MNP MQ:MTQ MR:MRT MS:MSR MT:MLT MU:MUS MV:MDV MW:MWI
    MX:MEX MY:MYS MZ:MOZ NA:NAM NC:NCL NE:NER NF:NFK NG:NGA NI:NIC NL:NLD NO:NOR NP:NPL NR:NRU
    NU:NIU NZ:NZL OM:OMN PA:PAN PE:PER PF:PYF PG:PNG PH:PHL PK:PAK PL:POL PM:SPM PN:PCN PR:PRI
    PS:PSE PT:PRT PW:PLW PY:PRY QA:QAT RE:REU RO:ROU RS:SRB RU:RUS RW:RWA SA:SAU SB:SLB SC:SYC
    SD:SDN SE:SWE SG:SGP SH:SHN SI:SVN SJ:SJM SK:SVK SL:SLE SM:SMR SN:SEN SO:SOM SR:SUR SS:SSD
    ST:STP SV:SLV SX:SXM SY:SYR SZ:SWZ TC:TCA TD:TCD TF:ATF TG:TGO TH:THA TJ:TJK TK:TKL TL:TLS
    TM:TKM TN:TUN TO:TON TR:TUR TT:TTO TV:TUV TW:TWN TZ:TZA UA:UKR UG:UGA UM:UMI US:USA UY:URY
    UZ:UZB VA:VAT VC:VCT VE:VEN VG:VGB VI:VIR VN:VNM VU:VUT WF:WLF WS:WSM YE:YEM YT:MYT ZA:ZAF
    ZM:ZMB ZW:ZWE`;

  it('lists every ISO 3166-1 country with its two codes, plus Kosovo', () => {
    // Kosovo has no ISO code yet; forms list it and XK is the code in common use.
    const want = [...ISO.trim().split(/\s+/), 'XK:XKX'].sort();
    expect(COUNTRIES.map(([code, alpha3]) => `${code}:${alpha3}`).sort()).toEqual(want);
  });

  // Two rows sharing a name or a code would make one of them unreachable.
  it.each(COUNTRIES.map(([code, ...spellings]) => [code, spellings] as const))('%s is found under each of its spellings', (code, spellings) => {
    expect(countryCode(code)).toBe(code);
    for (const spelling of spellings) expect(countryCode(spelling)).toBe(code);
  });
});

describe('findCountry', () => {
  const named: [text: string, want: string][] = [
    // Question labels from live forms.
    ['Are you legally authorized to work in the United States for our Company?', 'US'],
    ['Are you legally authorized to work in the US without visa sponsorship now or in the future?', 'US'],
    ['Do you have the ability to work in Australia without the need for sponsorship?', 'AU'],
    ['Do you have active membership in good standing with at least one U.S. state bar?', 'US'],
    ['Are you a Singapore citizen?', 'SG'],
    // Other ways of writing the same two countries.
    ['Are you authorized to work in the U.S.?', 'US'],
    ['Are you authorised to work in the u.s.a.?', 'US'],
    ['Are you authorized to work in the USA?', 'US'],
    ['Are you authorized to work in the United States of America?', 'US'],
    ['Are you authorized to work in America?', 'US'],
    ['Do you have the right to work in the UK?', 'GB'],
    ['Do you have the right to work in the United Kingdom (UK)?', 'GB'],
    ['Do you have the right to work in Great Britain?', 'GB'],
    // A longer name wins over the shorter name inside it.
    ['Do you have the right to work in Northern Ireland?', 'GB'],
    ['Do you have the right to work in Ireland?', 'IE'],
    ['Are you authorized to work in the Dominican Republic?', 'DO'],
    ['Are you authorized to work in Papua New Guinea?', 'PG'],
    ['Are you authorized to work in Guinea-Bissau?', 'GW'],
    ['Are you authorized to work in South Sudan?', 'SS'],
    ['Are you authorized to work in South Korea?', 'KR'],
    ['Are you authorized to work in the Democratic Republic of the Congo?', 'CD'],
    ['Are you authorized to work in the Republic of the Congo?', 'CG'],
    ['Are you authorized to work in the U.S. Virgin Islands?', 'VI'],
    ['Are you authorized to work in New South Wales?', 'AU'],
    // A US state names the United States, never the country inside its name.
    ['Are you legally authorized to work in California?', 'US'],
    ['Are you based in Indiana?', 'US'],
    ['Are you authorized to work in New Mexico?', 'US'],
    ['Are you authorized to work in New Jersey?', 'US'],
    ['Do you live in New England?', 'US'],
    ['Are you authorized to work in Washington, D.C.?', 'US'],
    // Georgia is a country and a US state. Alone it is read as the country,
    // so that somebody in the US is never answered for a job in Tbilisi.
    ['Are you legally authorized to work in Georgia?', 'GE'],
    ['Are you legally authorized to work in the Republic of Georgia?', 'GE'],
    // With the United States or another state named next to it, it is the state.
    ['This role is based in Atlanta, Georgia. Are you authorized to work in the United States?', 'US'],
    ['Are you authorized to work in the State of Georgia?', 'US'],
    ['Do you live in Georgia or Florida?', 'US'],
    // Accents and typographic apostrophes.
    ['Are you authorized to work in Côte d’Ivoire?', 'CI'],
    ['Are you authorized to work in Türkiye?', 'TR'],
    // Shouting does not hide the country.
    ['ARE YOU AUTHORIZED TO WORK IN THE US?', 'US'],
  ];

  it.each(named)('%s → %s', (text, want) => {
    expect(findCountry(text)).toBe(want);
  });

  const unnamed: [why: string, text: string][] = [
    ['an empty text', ''],
    // Real labels that name no country.
    ['"the country where the job is located"', 'Will you now or in the future require company sponsorship to retain or extend your work authorization in the country where the job is located?'],
    ['"e.g." and "etc." in brackets', 'Are you currently legally authorized to work in the country in which this job is based (e.g. you are a citizen, you have a visa, etc.)?'],
    ['a label without any place', 'Will you now or in the future require sponsorship for work authorization?'],
    ['"the country for which you are applying"', 'Are you legally authorized to work in the country for which you are applying?'],
    ['"your current location"', 'Will you now or in the future require sponsorship for a visa to remain in your current location?'],
    ['"country of residence"', 'What is your current country of residence?'],
    // "us" the pronoun.
    ['"about us" in a real label', "If you heard about us through a referral, please state the Brex employee's name."],
    ['"Tell us"', 'Tell us about yourself'],
    ['"Us" in a title', 'Why Do You Want To Work With Us?'],
    ['"us" inside "focus"', 'What is your focus area?'],
    ['"us" inside "status"', 'What is your visa status?'],
    // Words that only look like a country.
    ['"Indian"', 'Do you speak any Indian languages?'],
    ['lower-case "uk" in an address', 'See www.example.co.uk for details'],
    ['codes are not names: "IN" and "IT"', 'Do you work IN the IT department?'],
    ['codes are not names: "can"', 'CAN you start in June?'],
    ['a continent', 'Are you authorized to work in North America?'],
    ['"Latin America"', 'Do you have experience selling in Latin America?'],
    // Several countries: the question is not about one of them.
    ['two countries', 'Are you authorized to work in the United States or Canada?'],
    ['two countries, abbreviated', 'Are you authorized to work in the U.K. or the U.S.?'],
    ['a state and another country', 'Are you authorized to work in Canada? Our head office is in New York.'],
    ['Georgia and another country', 'Are you authorized to work in Georgia or Armenia?'],
  ];

  it.each(unnamed)('gives null for %s', (_why, text) => {
    expect(findCountry(text)).toBe(null);
  });
});

describe('findCountries', () => {
  const table: [text: string, want: string[]][] = [
    ['Are you authorized to work in the United States or Canada?', ['US', 'CA']],
    ['Are you authorized to work in the U.K. or the U.S.?', ['GB', 'US']],
    ['Are you authorized to work in Canada? Our head office is in New York.', ['CA', 'US']],
    ['Are you authorized to work in Georgia or Armenia?', ['GE', 'AM']],
    // One country written twice is still one country.
    ['Are you authorized to work in the United States (USA)? We are based in Texas.', ['US']],
    ['Will you now or in the future require sponsorship for work authorization?', []],
  ];

  it.each(table)('%s → %j', (text, want) => {
    expect(findCountries(text)).toEqual(want);
  });
});
