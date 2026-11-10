// @vitest-environment node
//
// lib/ats.ts is imported by wxt.config.ts, which WXT loads in plain Node.
// These tests therefore run without a DOM: a stray `document` in the module
// fails here instead of failing the build.
import { describe, expect, it } from 'vitest';
import { ATS_DOMAINS, ATS_NAMES, EMBED_HOST_PERMISSIONS, detectAts } from '../../lib/ats';
import type { AtsId } from '../../lib/types';

it('runs without a DOM, the way wxt.config.ts loads the module', () => {
  expect(typeof document).toBe('undefined');
});

describe('detectAts', () => {
  // URL shapes taken from the research notes (live pages fetched November 2026).
  const known: [url: string, want: AtsId][] = [
    ['https://job-boards.greenhouse.io/discord/jobs/8722538002', 'greenhouse'],
    ['https://boards.greenhouse.io/figma/jobs/5426468004', 'greenhouse'],
    ['https://job-boards.greenhouse.io/embed/job_app?for=gitlab&token=8638232002', 'greenhouse'],
    ['https://job-boards.eu.greenhouse.io/embed/job_app?for=acme&token=1', 'greenhouse'],
    ['https://greenhouse.io/', 'greenhouse'],
    ['https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply', 'lever'],
    ['https://jobs.eu.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd/apply', 'lever'],
    ['https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2/application', 'ashby'],
    ['https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite', 'workday'],
    ['https://wd5.myworkdaysite.com/recruiting/acme/careers', 'workday'],
    ['https://careers-acme.icims.com/jobs/1234/job', 'icims'],
    ['https://jobs.smartrecruiters.com/smartrecruiters/744000158320111', 'smartrecruiters'],
    ['https://apply.workable.com/typeform/j/0123456789/', 'workable'],
    ['https://acme.bamboohr.com/careers/42', 'bamboohr'],
    ['https://jobs.jobvite.com/jobvite/jobs', 'jobvite'],
    ['https://acme.taleo.net/careersection/2/jobdetail.ftl?job=1234', 'taleo'],
    ['https://career4.successfactors.com/career?company=acme', 'successfactors'],
    ['https://career2.successfactors.eu/career?company=acme', 'successfactors'],
    // Plain http still names the same site.
    ['http://jobs.lever.co/palantir', 'lever'],
    // Host names are case-insensitive.
    ['HTTPS://JOBS.LEVER.CO/palantir', 'lever'],
    // A port does not change whose host it is.
    ['https://jobs.ashbyhq.com:8443/ashby', 'ashby'],
  ];

  it.each(known)('%s is %s', (url, want) => {
    expect(detectAts(url)).toBe(want);
  });

  // A wrong "this is Greenhouse" makes the planner trust a page it should not,
  // so anything that merely looks like a job site must come back as null.
  const unknown: [why: string, url: string][] = [
    ['an empty string', ''],
    ['text that is not a URL', 'not a url'],
    ['a host without a scheme', 'jobs.lever.co/palantir'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['the real domain used as a subdomain of another site', 'https://greenhouse.io.evil.example/'],
    ['the real host name in front of another site', 'https://jobs.lever.co.evil.example/palantir/apply'],
    ['a longer name that ends in the real domain', 'https://notgreenhouse.io/'],
    ['clever.co, which ends in "lever.co"', 'https://clever.co/'],
    ['the real host in the user-name part', 'https://jobs.lever.co@evil.example/'],
    ['the real host in the path', 'https://evil.example/jobs.lever.co/palantir/apply'],
    ['the real host in the query', 'https://evil.example/?next=https://jobs.ashbyhq.com/ashby'],
    ['the real host in the fragment', 'https://evil.example/#boards.greenhouse.io'],
    ['a Cyrillic letter that looks like the first "e" of greenhouse', 'https://gr\u0435enhouse.io/'],
    ['the right name under another ending', 'https://greenhouse.com/'],
    ['ftp', 'ftp://boards.greenhouse.io/figma'],
    ['a local file', 'file:///Users/ada/jobs.lever.co.html'],
    ['an extension page', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/jobs.lever.co.html'],
    ['a blob created by a job site', 'blob:https://jobs.lever.co/0b5d1f6e-7b1c-4c56-a7f4-2f8a1c3d9e10'],
    ['a data: URL that mentions a job site', 'data:text/html,<a href="https://jobs.lever.co/">jobs</a>'],
    ['about:blank', 'about:blank'],
    ['a company page that embeds a Greenhouse form', 'https://instacart.careers/job/?gh_jid=8250324'],
    ['an ordinary site', 'https://www.example.com/careers'],
    ['a local test page', 'http://localhost:3000/greenhouse.io.html'],
  ];

  it.each(unknown)('gives null for %s', (_why, url) => {
    expect(detectAts(url)).toBe(null);
  });
});

describe('ATS_DOMAINS', () => {
  const entries = Object.entries(ATS_DOMAINS) as [AtsId, readonly string[]][];
  const rows = entries.flatMap(([ats, domains]) => domains.map((domain) => [domain, ats] as const));

  // detectAts compares host names, so an entry such as '*.icims.com' or
  // 'https://lever.co' would never match anything, and nothing would say so.
  it.each(rows)('%s is a bare lower-case domain', (domain) => {
    expect(domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
  });

  it.each(rows)('%s and its subdomains are detected as %s', (domain, ats) => {
    expect(detectAts(`https://${domain}/`)).toBe(ats);
    expect(detectAts(`https://jobs.${domain}/acme/apply`)).toBe(ats);
  });
});

describe('ATS_NAMES', () => {
  it.each(Object.keys(ATS_DOMAINS) as AtsId[])('has a name to show for %s', (ats) => {
    expect(ATS_NAMES[ats]).toMatch(/\S/);
  });
});

describe('EMBED_HOST_PERMISSIONS', () => {
  // Every entry becomes a host permission: Chrome names it in the install
  // prompt, and adding one later disables the extension until the user agrees.
  it('lists exactly the hosts verified to serve forms inside other sites', () => {
    expect(EMBED_HOST_PERMISSIONS).toEqual([
      'https://job-boards.greenhouse.io/*',
      'https://job-boards.eu.greenhouse.io/*',
      'https://jobs.ashbyhq.com/*',
    ]);
  });

  it('holds only https patterns for one exact host each', () => {
    for (const pattern of EMBED_HOST_PERMISSIONS) {
      // Rules out http, '<all_urls>', '*://*/*', 'https://*/*' and '*.greenhouse.io'.
      expect(pattern).toMatch(/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\/\*$/);
    }
  });

  it('holds no local address (those belong to the e2e build only)', () => {
    for (const pattern of EMBED_HOST_PERMISSIONS) {
      expect(pattern).not.toMatch(/localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/);
    }
  });

  it('holds only hosts of known job sites', () => {
    const sites = EMBED_HOST_PERMISSIONS.map((pattern) => detectAts(pattern.replace('*', 'embed/job_app')));
    expect(sites).toEqual(['greenhouse', 'greenhouse', 'ashby']);
  });
});
