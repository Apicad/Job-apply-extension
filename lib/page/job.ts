/**
 * Reads the job title and the company name from a page, for the popup.
 *
 * Page side: it runs in the page's document next to the scan. It only reads,
 * never throws, and reports only what the page itself states. Where a source
 * is missing, broken or ambiguous the answer is '' — never a guess.
 */
import type { AtsId, ExtractJob, JobInfo } from '../types';

/** Longest title or company kept. The background applies its own limit again (lib/report.ts). */
const MAX_LENGTH = 200;

const NOTHING: JobInfo = { title: '', company: '' };

export const extractJob: ExtractJob = (doc, ats) => {
  try {
    // Most reliable source first. Title and company are looked up separately:
    // each comes from the first source that has it.
    const sources = [fromJsonLd(doc), fromPageTitle(doc, ats), fromOpenGraph(doc), fromHeading(doc)];
    return {
      title: firstText(sources.map((source) => source.title)),
      company: firstText(sources.map((source) => source.company)),
    };
  } catch {
    // A page can break the DOM itself: <form name="querySelector"> replaces
    // document.querySelector with that form. The job title is a nicety, so
    // failing to read it must never stop the scan.
    return { title: '', company: '' };
  }
};

// ---------------------------------------------------------------------------
// Source 1: a JobPosting in JSON-LD, the description job pages publish for
// search engines. It names title and company outright, so nothing is guessed.
// ---------------------------------------------------------------------------

function fromJsonLd(doc: Document): JobInfo {
  const postings: Record<string, unknown>[] = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    for (const thing of thingsIn(parseJson(script.textContent ?? ''))) {
      if (isJobPosting(thing)) postings.push(thing);
    }
  }
  // Exactly one. With two postings on a page nobody can tell which one this form is for.
  const [posting, another] = postings;
  if (posting === undefined || another !== undefined) return NOTHING;
  const organization = posting.hiringOrganization;
  return {
    title: typeof posting.title === 'string' ? posting.title : '',
    company: isRecord(organization) && typeof organization.name === 'string' ? organization.name : '',
  };
}

/** The data in one JSON-LD script, or null when it is not valid JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null; // broken or commented-out JSON on someone else's page: skip it, never throw
  }
}

/** The things one JSON-LD script describes: one thing or a list, possibly wrapped in { "@graph": … }. */
function thingsIn(data: unknown): unknown[] {
  const top: unknown[] = Array.isArray(data) ? data : [data];
  return top.flatMap((thing) => {
    // A thing with "@graph" is only a wrapper: what it describes is inside.
    // flatMap() spreads a list and keeps a single thing as it is.
    const graph = isRecord(thing) ? thing['@graph'] : undefined;
    return graph === undefined ? [thing] : graph;
  });
}

function isJobPosting(thing: unknown): thing is Record<string, unknown> {
  if (!isRecord(thing)) return false;
  const type = thing['@type'];
  return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Source 2: the page title, on job sites whose titles have a known shape.
// ---------------------------------------------------------------------------

/**
 * How each job site writes its page title. On every other site the title is
 * left whole: splitting "Engineer - Backend" would invent a company.
 */
const TITLE_SHAPES: Partial<Record<AtsId, RegExp>> = {
  // "Job Application for Engineering Manager, Machine Learning (Safety) at Discord".
  // The first .+ takes all it can, so the company is what follows the LAST " at ".
  greenhouse: /^Job Application for (?<title>.+) at (?<company>.+)$/,
  // "Palantir Technologies - Administrative Business Partner": company first.
  // .+? takes as little as it can, so the company ends at the FIRST " - ".
  lever: /^(?<company>.+?) - (?<title>.+)$/,
  // "Software Engineer @ Analytical Engines"
  ashby: /^(?<title>.+) @ (?<company>.+)$/,
};

function fromPageTitle(doc: Document, ats: AtsId | null): JobInfo {
  const shape = ats === null ? undefined : TITLE_SHAPES[ats];
  if (shape === undefined) return NOTHING;
  // Not doc.title: a form named "title" replaces that property with the form
  // element. And only the <title> in <head>: an SVG icon can have its own.
  const pageTitle = tidy(doc.querySelector('head > title')?.textContent ?? '');
  const parts = shape.exec(pageTitle)?.groups;
  return { title: parts?.title ?? '', company: parts?.company ?? '' };
}

// ---------------------------------------------------------------------------
// Source 3: Open Graph tags, what the page shows when its link is shared.
// Source 4: the first top-level heading, for the title only.
// ---------------------------------------------------------------------------

function fromOpenGraph(doc: Document): JobInfo {
  return {
    title: doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
    company: doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '',
  };
}

function fromHeading(doc: Document): JobInfo {
  // Only h1: smaller headings are section names such as "Submit your application".
  return { title: doc.querySelector('h1')?.textContent ?? '', company: '' };
}

// ---------------------------------------------------------------------------
// Text from someone else's page
// ---------------------------------------------------------------------------

/** The first text that still says something once tidied, cut to the limit; '' when none does. */
function firstText(texts: readonly string[]): string {
  for (const text of texts) {
    const clean = cut(tidy(text));
    if (clean !== '') return clean;
  }
  return '';
}

/**
 * One line of readable text. Control characters are removed; line breaks,
 * tabs and indentation (a <title> or <h1> is often spread over several lines)
 * become single spaces; no space is left at the ends.
 */
function tidy(text: string): string {
  // The first pattern leaves out tab, line feed, vertical tab, form feed and
  // carriage return: those are white space, which the second pattern handles.
  return text.replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim();
}

/** The first MAX_LENGTH units of a text, never ending on half a character or on a space. */
function cut(text: string): string {
  if (text.length <= MAX_LENGTH) return text;
  // Most emoji take two units, a "high" one and then a "low" one. When the
  // last unit we keep is a high one, its partner falls off: drop both.
  const lastKept = text.charCodeAt(MAX_LENGTH - 1);
  const splitsPair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, splitsPair ? MAX_LENGTH - 1 : MAX_LENGTH).trimEnd();
}
