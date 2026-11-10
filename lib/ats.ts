/**
 * Which job site (applicant tracking system, "ATS") a page belongs to, and
 * which job-site hosts the extension asks permission for.
 *
 * wxt.config.ts imports this file, and WXT loads its config in plain Node. So
 * nothing here may touch the DOM, use an extension API or the `@/` alias, or
 * import anything except types.
 */
import type { AtsId, DetectAts } from './types';

/**
 * The registrable domains of each job site. A page is "on" a site when its
 * host is one of these or a subdomain of one. This list only recognises
 * sites; it grants no permission (see EMBED_HOST_PERMISSIONS for that).
 *
 * `satisfies` makes the compiler insist on an entry for every AtsId.
 */
export const ATS_DOMAINS = {
  // boards.greenhouse.io, job-boards.greenhouse.io, job-boards.eu.greenhouse.io
  greenhouse: ['greenhouse.io'],
  // jobs.lever.co, jobs.eu.lever.co
  lever: ['lever.co'],
  // jobs.ashbyhq.com
  ashby: ['ashbyhq.com'],
  // <tenant>.wd5.myworkdayjobs.com, wd5.myworkdaysite.com
  workday: ['myworkdayjobs.com', 'myworkdaysite.com'],
  // careers-<company>.icims.com
  icims: ['icims.com'],
  // jobs.smartrecruiters.com, careers.smartrecruiters.com
  smartrecruiters: ['smartrecruiters.com'],
  // apply.workable.com
  workable: ['workable.com'],
  // <company>.bamboohr.com
  bamboohr: ['bamboohr.com'],
  // jobs.jobvite.com
  jobvite: ['jobvite.com'],
  // <company>.taleo.net
  taleo: ['taleo.net'],
  // career4.successfactors.com, career2.successfactors.eu
  successfactors: ['successfactors.com', 'successfactors.eu'],
} as const satisfies { readonly [K in AtsId]: readonly string[] };

/** The name of each job site as the popup shows it. */
export const ATS_NAMES: { readonly [K in AtsId]: string } = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  icims: 'iCIMS',
  smartrecruiters: 'SmartRecruiters',
  workable: 'Workable',
  bamboohr: 'BambooHR',
  jobvite: 'Jobvite',
  taleo: 'Taleo',
  successfactors: 'SAP SuccessFactors',
};

/**
 * The host permissions the extension asks for at install time.
 *
 * A toolbar click already gives access to the page in the tab, so a job site
 * opened directly needs nothing here. A permission is only needed where a
 * company shows the job site's form inside its own page, in a frame from
 * another origin. These are the hosts verified to be embedded that way.
 *
 * Keep the list exact and short: Chrome names every entry in the install
 * prompt, and an entry added in an update switches the extension off until
 * the user accepts it. Add a host only with a real embedded example in hand.
 */
export const EMBED_HOST_PERMISSIONS: readonly string[] = [
  'https://job-boards.greenhouse.io/*',
  'https://job-boards.eu.greenhouse.io/*',
  'https://jobs.ashbyhq.com/*',
];

/** Every job-site id, in the order of ATS_DOMAINS. Object.keys() only promises string[]. */
const ATS_IDS = Object.keys(ATS_DOMAINS) as AtsId[];

/**
 * The job site a URL is on, or null. Only the host decides: a job site's name
 * anywhere else in the URL means nothing.
 */
export const detectAts: DetectAts = (url) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // '' or 'jobs.lever.co/acme' without a scheme: not a URL at all
  }
  // 'blob:https://jobs.lever.co/…' and 'file:' pages are not served by the job site.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  // URL has already lower-cased the host and turned non-ASCII letters into
  // punycode, so a Cyrillic look-alike of 'greenhouse.io' no longer equals it.
  const host = parsed.hostname;
  for (const ats of ATS_IDS) {
    for (const domain of ATS_DOMAINS[ats]) {
      // The dot matters: 'notgreenhouse.io' and 'clever.co' end with a known
      // domain too. And comparing from the end keeps out 'greenhouse.io.evil.example'.
      if (host === domain || host.endsWith(`.${domain}`)) return ats;
    }
  }
  return null;
};
