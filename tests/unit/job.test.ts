import { describe, expect, it } from 'vitest';
import { extractJob } from '../../lib/page/job';
import type { AtsId, JobInfo } from '../../lib/types';

/** A real (jsdom) document parsed from markup, the way a browser would. */
function page(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractJob: the page title on a known job site', () => {
  const shapes: [name: string, pageTitle: string, ats: AtsId, want: JobInfo][] = [
    [
      'Greenhouse (live Discord posting)',
      'Job Application for Engineering Manager, Machine Learning (Safety) at Discord',
      'greenhouse',
      { title: 'Engineering Manager, Machine Learning (Safety)', company: 'Discord' },
    ],
    [
      'Greenhouse (Figma)',
      'Job Application for Account Executive, Enterprise at Figma',
      'greenhouse',
      { title: 'Account Executive, Enterprise', company: 'Figma' },
    ],
    [
      'Greenhouse with " at " inside the job title: the company is after the last one',
      'Job Application for Engineer at Large at Analytical Engines',
      'greenhouse',
      { title: 'Engineer at Large', company: 'Analytical Engines' },
    ],
    [
      'Lever (live Palantir posting): company first',
      'Palantir Technologies - Administrative Business Partner',
      'lever',
      { title: 'Administrative Business Partner', company: 'Palantir Technologies' },
    ],
    [
      'Lever with " - " inside the job title: the company is before the first one',
      'Analytical Engines - Engineer - Backend',
      'lever',
      { title: 'Engineer - Backend', company: 'Analytical Engines' },
    ],
    [
      'Lever with a hyphenated word, which is not a separator',
      'Analytical Engines - Full-Stack Engineer',
      'lever',
      { title: 'Full-Stack Engineer', company: 'Analytical Engines' },
    ],
    [
      'Ashby',
      'Software Engineer @ Analytical Engines',
      'ashby',
      { title: 'Software Engineer', company: 'Analytical Engines' },
    ],
    [
      'Ashby with " @ " inside the job title: the company is after the last one',
      'Developer Advocate @ Events @ Analytical Engines',
      'ashby',
      { title: 'Developer Advocate @ Events', company: 'Analytical Engines' },
    ],
  ];

  it.each(shapes)('%s', (_name, pageTitle, ats, want) => {
    const doc = page(`<html><head><title>${pageTitle}</title></head><body></body></html>`);

    expect(extractJob(doc, ats)).toEqual(want);
  });

  // Splitting a title that is not in the site's shape invents a company:
  // "Engineer - Backend" would become company "Engineer", job "Backend".
  const notShapes: [name: string, pageTitle: string, ats: AtsId | null][] = [
    ['a Lever-shaped title on an unknown site', 'Engineer - Backend', null],
    ['a Greenhouse-shaped title on an unknown site', 'Job Application for Engineer at Analytical Engines', null],
    ['an Ashby-shaped title on an unknown site', 'Engineer @ Analytical Engines', null],
    ['a Lever-shaped title on Greenhouse', 'Analytical Engines - Engineer', 'greenhouse'],
    ['a Lever-shaped title on Ashby', 'Analytical Engines - Engineer', 'ashby'],
    ['a Greenhouse-shaped title on Ashby', 'Job Application for Engineer at Analytical Engines', 'ashby'],
    ['an Ashby-shaped title on Lever', 'Engineer @ Analytical Engines', 'lever'],
    ['an Ashby-shaped title on Greenhouse', 'Engineer @ Analytical Engines', 'greenhouse'],
    ['a Lever-shaped title on a site with no known shape', 'Analytical Engines - Engineer', 'workday'],
    ['a Greenhouse-shaped title on a site with no known shape', 'Job Application for Engineer at Analytical Engines', 'workday'],
    ['an Ashby-shaped title on a site with no known shape', 'Engineer @ Analytical Engines', 'icims'],
    ['the Greenhouse list of jobs', 'Jobs at Discord', 'greenhouse'],
    ['a Greenhouse title that names no company', 'Job Application for Engineer', 'greenhouse'],
    ['a Greenhouse title in another case', 'JOB APPLICATION FOR ENGINEER AT ANALYTICAL ENGINES', 'greenhouse'],
    ['the Lever list of jobs, which is only the company name', 'Palantir Technologies', 'lever'],
    ['a hyphenated word on Lever', 'Full-Stack Engineer', 'lever'],
    ['a Lever title that ends at the separator', 'Analytical Engines - ', 'lever'],
    ['an e-mail address on Ashby', 'careers@example.com', 'ashby'],
    ['an Ashby title that starts at the separator', ' @ Analytical Engines', 'ashby'],
    ['an empty title', '', 'greenhouse'],
  ];

  it.each(notShapes)('reads nothing from %s', (_name, pageTitle, ats) => {
    const doc = page(`<html><head><title>${pageTitle}</title></head><body></body></html>`);

    expect(extractJob(doc, ats)).toEqual({ title: '', company: '' });
  });

  it('reads the title element even when a form is named "title"', () => {
    // A named form replaces document.title with the form element itself.
    const doc = page(`
      <html>
        <head><title>Job Application for Staff Engineer at Analytical Engines</title></head>
        <body><form name="title"><input name="first_name"></form></body>
      </html>`);

    expect(extractJob(doc, 'greenhouse')).toEqual({ title: 'Staff Engineer', company: 'Analytical Engines' });
  });

  it('does not take the <title> of an icon for the page title', () => {
    const doc = page(`
      <html>
        <head></head>
        <body><svg><title>Job Application for Close Icon at Analytical Engines</title></svg></body>
      </html>`);

    expect(extractJob(doc, 'greenhouse')).toEqual({ title: '', company: '' });
  });
});

describe('extractJob: a JobPosting in JSON-LD', () => {
  /** The script element a page uses to describe itself to search engines. */
  function jsonLd(data: unknown): string {
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  }

  /** A posting in the shape search engines ask for. */
  const posting = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: 'Software Engineer',
    description: '<p>Build engines.</p>',
    datePosted: '2026-11-01',
    employmentType: 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: 'Analytical Engines', sameAs: 'https://www.example.com' },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'London' } },
  };
  const organization = { '@context': 'https://schema.org/', '@type': 'Organization', name: 'Some Other Name' };
  const found: JobInfo = { title: 'Software Engineer', company: 'Analytical Engines' };

  const readable: [name: string, head: string, ats: AtsId | null, want: JobInfo][] = [
    ['a posting on its own', jsonLd(posting), null, found],
    ['a posting in a list of things', jsonLd([organization, posting]), null, found],
    ['a posting inside @graph', jsonLd({ '@context': 'https://schema.org/', '@graph': [organization, posting] }), null, found],
    ['a posting whose @type is a list', jsonLd({ ...posting, '@type': ['JobPosting'] }), null, found],
    ['a posting in the second script', jsonLd(organization) + jsonLd(posting), null, found],
    ['a posting after a script that is not valid JSON', '<script type="application/ld+json">{ oops</script>' + jsonLd(posting), null, found],
    [
      'the page title when the JSON-LD is not valid JSON',
      '<script type="application/ld+json">{ "@type": "JobPosting", </script><title>Analytical Engines - Software Engineer</title>',
      'lever',
      found,
    ],
    [
      'a posting on a job site: it is read before the page title',
      jsonLd(posting) + '<title>Engines Inc - Engineer II</title>',
      'lever',
      found,
    ],
    [
      'a posting without a company: the company comes from the page title',
      jsonLd({ '@type': 'JobPosting', title: 'Software Engineer' }) + '<title>Engines Inc - Engineer II</title>',
      'lever',
      { title: 'Software Engineer', company: 'Engines Inc' },
    ],
    [
      'a posting without a title: the title comes from the page title',
      jsonLd({ '@type': 'JobPosting', hiringOrganization: { name: 'Analytical Engines' } }) +
        '<title>Engines Inc - Engineer II</title>',
      'lever',
      { title: 'Engineer II', company: 'Analytical Engines' },
    ],
    [
      'a posting whose title is not text: only the company is read',
      jsonLd({ ...posting, title: { '@value': 'Software Engineer' } }),
      null,
      { title: '', company: 'Analytical Engines' },
    ],
    [
      'a posting whose company is plain text, not an organization: only the title is read',
      jsonLd({ ...posting, hiringOrganization: 'Analytical Engines' }),
      null,
      { title: 'Software Engineer', company: '' },
    ],
    [
      'a posting whose company name is not text',
      jsonLd({ ...posting, hiringOrganization: { name: ['Analytical Engines'] } }),
      null,
      { title: 'Software Engineer', company: '' },
    ],
    ['a posting whose company is null', jsonLd({ ...posting, hiringOrganization: null }), null, { title: 'Software Engineer', company: '' }],
  ];

  it.each(readable)('reads %s', (_name, head, ats, want) => {
    const doc = page(`<html><head>${head}</head><body></body></html>`);

    expect(extractJob(doc, ats)).toEqual(want);
  });

  const unreadable: [name: string, head: string][] = [
    ['an organization, which is not a posting', jsonLd({ ...organization, title: 'Software Engineer' })],
    ['a web site description', jsonLd({ '@type': 'WebSite', name: 'Analytical Engines Careers', title: 'Careers' })],
    ['another type that has a title', jsonLd({ ...posting, '@type': 'Occupation' })],
    ['a type in the wrong case', jsonLd({ ...posting, '@type': 'jobposting' })],
    ['a posting with no type', jsonLd({ title: 'Software Engineer', hiringOrganization: { name: 'Analytical Engines' } })],
    // Which of the two is this form for? Nobody can tell, so neither is used.
    ['two postings on one page', jsonLd(posting) + jsonLd({ ...posting, title: 'Product Designer' })],
    ['two postings in one list', jsonLd([posting, { ...posting, title: 'Product Designer' }])],
    ['JSON that stops halfway', '<script type="application/ld+json">{ "@type": "JobPosting", "title": </script>'],
    ['JSON inside an HTML comment', `<script type="application/ld+json"><!-- ${JSON.stringify(posting)} --></script>`],
    ['an empty script', '<script type="application/ld+json"></script>'],
    ['JSON that is null', jsonLd(null)],
    ['JSON that is a number', jsonLd(42)],
    ['JSON that is text', jsonLd('JobPosting')],
    ['JSON that is a list of other things', jsonLd([null, 42, 'JobPosting', []])],
    ['a @graph that is not a list', jsonLd({ '@graph': posting })],
    ['a posting in a script of another type', `<script type="application/json">${JSON.stringify(posting)}</script>`],
  ];

  it.each(unreadable)('reads nothing from %s, and does not throw', (_name, head) => {
    const doc = page(`<html><head>${head}</head><body></body></html>`);

    expect(extractJob(doc, null)).toEqual({ title: '', company: '' });
  });
});

describe('extractJob: Open Graph tags and the first heading', () => {
  const pages: [name: string, html: string, ats: AtsId | null, want: JobInfo][] = [
    [
      'og:title and og:site_name on an unknown site',
      `<head>
         <title>Software Engineer | Careers | Analytical Engines</title>
         <meta property="og:title" content="Software Engineer">
         <meta property="og:site_name" content="Analytical Engines">
       </head>`,
      null,
      { title: 'Software Engineer', company: 'Analytical Engines' },
    ],
    [
      // The live Greenhouse page has og:title with the job title only and no og:site_name.
      'a Greenhouse page whose title is not in the usual shape',
      `<head>
         <title>Discord Careers</title>
         <meta property="og:title" content="Engineering Manager, Machine Learning (Safety)">
       </head>`,
      'greenhouse',
      { title: 'Engineering Manager, Machine Learning (Safety)', company: '' },
    ],
    [
      'a job site page with both: the page title is read before og:title',
      `<head>
         <title>Job Application for Engineering Manager, Machine Learning (Safety) at Discord</title>
         <meta property="og:title" content="Engineering Manager">
         <meta property="og:site_name" content="Greenhouse">
       </head>`,
      'greenhouse',
      { title: 'Engineering Manager, Machine Learning (Safety)', company: 'Discord' },
    ],
    [
      'the first h1, for the job title only',
      '<body><h1>Software Engineer</h1><h1>Analytical Engines</h1></body>',
      null,
      { title: 'Software Engineer', company: '' },
    ],
    [
      'og:title and an h1: og:title is read first',
      '<head><meta property="og:title" content="Software Engineer"></head><body><h1>Apply for this job</h1></body>',
      null,
      { title: 'Software Engineer', company: '' },
    ],
    [
      'an og:title with nothing in it: the h1 is used',
      '<head><meta property="og:title" content=""></head><body><h1>Software Engineer</h1></body>',
      null,
      { title: 'Software Engineer', company: '' },
    ],
    [
      'an og:title without content: the h1 is used',
      '<head><meta property="og:title"></head><body><h1>Software Engineer</h1></body>',
      null,
      { title: 'Software Engineer', company: '' },
    ],
    // Must not be read.
    [
      'smaller headings, which are usually section names',
      '<body><h2>Submit your application</h2><h3>Voluntary Self-Identification</h3></body>',
      null,
      { title: '', company: '' },
    ],
    [
      'other meta tags',
      `<head>
         <meta name="description" content="Software Engineer at Analytical Engines">
         <meta property="og:description" content="Software Engineer at Analytical Engines">
         <meta name="author" content="Analytical Engines">
       </head>`,
      null,
      { title: '', company: '' },
    ],
    ['a page with nothing on it', '', null, { title: '', company: '' }],
  ];

  it.each(pages)('%s', (_name, html, ats, want) => {
    expect(extractJob(page(`<html>${html}</html>`), ats)).toEqual(want);
  });
});

describe('extractJob: tidying what it found', () => {
  // The text comes from someone else's page and ends up in the popup.
  const pages: [name: string, html: string, ats: AtsId | null, want: JobInfo][] = [
    [
      'line breaks and indentation in the title element',
      '<head><title>\n      Job Application for\n   Staff   Engineer at\tAnalytical Engines \n  </title></head>',
      'greenhouse',
      { title: 'Staff Engineer', company: 'Analytical Engines' },
    ],
    [
      'markup and line breaks inside the heading',
      '<body><h1>\n  <span>Software</span>\n  <span>Engineer</span>\n</h1></body>',
      null,
      { title: 'Software Engineer', company: '' },
    ],
    ['a no-break space', '<body><h1>Software&nbsp;Engineer</h1></body>', null, { title: 'Software Engineer', company: '' }],
    [
      'space around Open Graph values',
      `<head>
         <meta property="og:title" content="  Software Engineer ">
         <meta property="og:site_name" content=" Analytical   Engines  ">
       </head>`,
      null,
      { title: 'Software Engineer', company: 'Analytical Engines' },
    ],
    [
      'control characters, which leave no gap inside a word',
      // JSON.stringify writes them as \u0000 escapes, JSON.parse turns them back into the real characters.
      `<head><script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'Soft\u0000ware Engineer\u0007',
        hiringOrganization: { name: '\u001bAnalytical Engines\u007f\u009f' },
      })}</script></head>`,
      null,
      { title: 'Software Engineer', company: 'Analytical Engines' },
    ],
    [
      'values with nothing visible in them: the next source is used',
      `<head>
         <script type="application/ld+json">${JSON.stringify({
           '@type': 'JobPosting',
           title: ' \n\t ',
           hiringOrganization: { name: '\u0000' },
         })}</script>
         <meta property="og:title" content="Software Engineer">
         <meta property="og:site_name" content="Analytical Engines">
       </head>`,
      null,
      { title: 'Software Engineer', company: 'Analytical Engines' },
    ],
    [
      'a heading longer than 200 characters',
      `<body><h1>${'x'.repeat(300)}</h1></body>`,
      null,
      { title: 'x'.repeat(200), company: '' },
    ],
    [
      'a company longer than 200 characters',
      `<head><meta property="og:site_name" content="${'y'.repeat(300)}"></head>`,
      null,
      { title: '', company: 'y'.repeat(200) },
    ],
    [
      // Cutting the whole page title first would lose the company at its end.
      'a very long job title in a Greenhouse page title: the company survives',
      `<head><title>Job Application for ${'x'.repeat(300)} at Discord</title></head>`,
      'greenhouse',
      { title: 'x'.repeat(200), company: 'Discord' },
    ],
    [
      'a cut that would end in a space',
      `<body><h1>${'x'.repeat(199)} and more</h1></body>`,
      null,
      { title: 'x'.repeat(199), company: '' },
    ],
    [
      // An emoji is two units long; half of one is a broken character.
      'a cut that would split an emoji',
      `<body><h1>${'x'.repeat(199)}\u{1f680} team</h1></body>`,
      null,
      { title: 'x'.repeat(199), company: '' },
    ],
    [
      'an emoji that just fits',
      `<body><h1>${'x'.repeat(198)}\u{1f680} team</h1></body>`,
      null,
      { title: `${'x'.repeat(198)}\u{1f680}`, company: '' },
    ],
  ];

  it.each(pages)('%s', (_name, html, ats, want) => {
    expect(extractJob(page(`<html>${html}</html>`), ats)).toEqual(want);
  });
});

describe('extractJob: a page that breaks the DOM itself', () => {
  // An element with a name replaces the property of that name on `document`
  // ("DOM clobbering"), methods included. Reading the job title is a nicety;
  // it must never be the reason a form cannot be scanned.
  it('gives up quietly when forms are named like the methods it needs', () => {
    const doc = page(`
      <html>
        <head><title>Job Application for Staff Engineer at Analytical Engines</title></head>
        <body><form name="querySelector"></form><form name="querySelectorAll"></form></body>
      </html>`);

    expect(extractJob(doc, 'greenhouse')).toEqual({ title: '', company: '' });
  });
});
