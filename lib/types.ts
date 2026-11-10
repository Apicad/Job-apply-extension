/**
 * Shared types for the whole extension. This file contains no logic.
 *
 * Reading order: Profile → FieldKind → FieldDescriptor → FrameScan →
 * FillAction → FieldResult → PageReport → messages → function contracts.
 *
 * Everything that crosses a boundary (script result, message, storage) is
 * plain JSON: strings, numbers, booleans, null, arrays, objects. No optional
 * members, no undefined, no class instances.
 */

// ---------------------------------------------------------------------------
// The user's saved profile
// ---------------------------------------------------------------------------

/** '' always means "not answered — never answer this for the user". */
export type YesNo = '' | 'yes' | 'no';
export type Gender = '' | 'male' | 'female' | 'nonbinary' | 'decline';
export type Race =
  | ''
  | 'asian'
  | 'black'
  | 'hispanic'
  | 'white'
  | 'nativeAmerican'
  | 'pacificIslander'
  | 'twoOrMore'
  | 'decline';
/** US forms ask about *protected* veteran status, so the two are kept apart. */
export type Veteran = '' | 'notVeteran' | 'protectedVeteran' | 'veteranNotProtected' | 'decline';
export type Disability = '' | 'yes' | 'no' | 'decline';

/**
 * Everything the user saves about themselves. Every field is a string and ''
 * means "no value" — nothing is ever written for an empty field.
 *
 * Other work builds on these fields. Add fields freely; never change what an
 * existing field means.
 */
export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  addressLine1: string;
  city: string;
  /** As the user typed it: "CA" or "California". Matching handles both. */
  state: string;
  postalCode: string;
  /** Country of residence, as typed: "United States", "US", "USA"… */
  country: string;

  linkedin: string;
  github: string;
  portfolio: string;

  currentCompany: string;
  currentTitle: string;

  school: string;
  degree: string;
  major: string;
  /** 'YYYY-MM' (the value of <input type="month">), or ''. */
  graduationDate: string;
  gpa: string;

  /**
   * "Are you legally authorized to work in the country you live in?" The
   * answer is only used for questions about `country` or about no named
   * country; a question naming any other country is left for the user.
   */
  workAuthorization: YesNo;
  /** "Will you now or in the future require visa sponsorship?" Same scope. */
  sponsorship: YesNo;

  // Voluntary self-identification. All optional; '' leaves the question alone.
  gender: Gender;
  race: Race;
  veteran: Veteran;
  disability: Disability;
}

/** A résumé file kept in extension storage. */
export interface StoredResume {
  /** File name only, no path, e.g. "Ada-Lovelace-Resume.pdf". */
  name: string;
  /** MIME type, e.g. "application/pdf". */
  type: string;
  /** Size of the original file in bytes. */
  size: number;
  /** "data:<type>;base64,<data>". Never passed to fetch, src or href. */
  dataUrl: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
}

/** What the planner needs to know about the résumé without holding its bytes. */
export type ResumeMeta = Pick<StoredResume, 'name' | 'type' | 'size'>;

// ---------------------------------------------------------------------------
// Recognising form fields
// ---------------------------------------------------------------------------

/** What a form field is asking for. "No kind" (null) means: leave it alone. */
export type FieldKind =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  /** One "where are you based" field. Recognised but never written in v1: on the big job sites it is a typeahead. */
  | 'location'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'currentCompany'
  | 'currentTitle'
  | 'school'
  | 'degree'
  | 'major'
  /** Month and year: "May 2027", or "2027-05" for <input type="month">. */
  | 'graduationDate'
  /** Year only: "2027". */
  | 'graduationYear'
  | 'gpa'
  | 'workAuthorization'
  | 'sponsorship'
  | 'gender'
  | 'race'
  | 'veteran'
  | 'disability'
  /** A file input that wants the résumé / CV. */
  | 'resume';

/** Kinds answered by choosing an option. Never typed into a text field. */
export type EnumKind = 'workAuthorization' | 'sponsorship' | 'gender' | 'race' | 'veteran' | 'disability';

/**
 * The control a descriptor describes.
 * - 'radio' is a whole radio group.
 * - 'combobox' is an <input> that drives a custom dropdown or typeahead
 *   (role=combobox/listbox, aria-autocomplete=list/both, or aria-haspopup set
 *   and not "false"). It looks like a text box and must never be typed into.
 * Checkboxes are not collected at all in v1.
 */
export type ControlType = 'text' | 'textarea' | 'select' | 'radio' | 'combobox' | 'file';

/** One choice of a <select> or radio group, index-aligned with the DOM. */
export interface ChoiceOption {
  /** The text the user sees, whitespace-collapsed. */
  label: string;
  /** The value attribute ('' when absent). */
  value: string;
  disabled: boolean;
}

/**
 * Everything the classifier may look at for one control. Plain data, so
 * classification is unit-tested without a DOM and runs outside the page.
 */
export interface FieldDescriptor {
  control: ControlType;
  /** The <input type>, lowercased ('text' when absent; '' for textarea, select and radio groups use 'radio'). */
  inputType: string;
  /** The raw autocomplete attribute, lowercased and trimmed ('' when absent). */
  autocomplete: string;
  /**
   * The visible label or question, cleaned: whitespace collapsed, required
   * markers (*, ✱, "(required)") removed, never including option text. For a
   * radio group this is the question, never an option label. '' when none.
   */
  label: string;
  /**
   * Name of the closest group around the control that has one: the legend of
   * a fieldset, or what aria-labelledby / aria-label call a fieldset,
   * role=group or role=radiogroup. Cleaned like a label. '' when none.
   */
  groupLabel: string;
  name: string;
  id: string;
  placeholder: string;
  /** The control's own data-automation-id, data-qa, data-testid, data-test, data-field, data-name values, space-joined. */
  hints: string;
  /**
   * required attribute or aria-required="true": on the control, on any radio
   * of a group, or on a group that holds this control and no other field.
   */
  required: boolean;
  /** Choices of a select or radio group, index-aligned with the DOM ([] otherwise). */
  options: ChoiceOption[];
  /** accept attribute of a file input ('' otherwise). */
  accept: string;
}

// ---------------------------------------------------------------------------
// Scan: what the page-side script reports. It never sees the profile.
// ---------------------------------------------------------------------------

export interface ScannedField {
  /** Handle for this control, valid in this document until it unloads. */
  ref: number;
  /** Which form the control belongs to: index among the document's forms, or -1 for controls with no form owner. */
  form: number;
  descriptor: FieldDescriptor;
  /** True when the user has not answered this control (see CLAUDE.md, "empty"). */
  empty: boolean;
}

export interface JobInfo {
  /** Job title, '' when it could not be determined. */
  title: string;
  /** Company name, '' when it could not be determined. */
  company: string;
}

/** What scanning one frame's document returns. */
export interface FrameScan {
  /** location.href of the frame. */
  url: string;
  /** True for the tab's top frame. */
  top: boolean;
  /**
   * False when this frame is hidden by the page that embeds it (or too small
   * to be a form). Nothing is ever written into such a frame.
   */
  shown: boolean;
  job: JobInfo;
  /** Controls in document order. Hidden and disabled controls are not listed. */
  fields: ScannedField[];
  /** Origins of visible, form-sized iframes in this document that come from another origin. */
  childOrigins: string[];
  /** '' when the scan worked; otherwise a short technical message. */
  error: string;
}

/** One frame's scan as the background receives it from chrome.scripting. */
export interface FrameScanResult {
  frameId: number;
  documentId: string;
  /** null when the script returned nothing usable. */
  scan: FrameScan | null;
}

// ---------------------------------------------------------------------------
// Fill: the background decides, the page-side script only carries it out
// ---------------------------------------------------------------------------

/** One instruction for the page-side script. `ref` comes from the scan. */
export type FillAction =
  | { ref: number; type: 'text'; value: string }
  | { ref: number; type: 'select'; index: number }
  | { ref: number; type: 'radio'; index: number }
  | { ref: number; type: 'file'; file: StoredResume };

/** What the page-side script reports back for one action. */
export interface FillOutcome {
  ref: number;
  /** True when the control holds an answer after the write. */
  ok: boolean;
}

/** The actions planned for one document. The résumé bytes are added only when sending. */
export interface DocumentPlan {
  documentId: string;
  frameId: number;
  actions: PlannedAction[];
}

/** A FillAction before the résumé bytes are attached. */
export type PlannedAction =
  | { ref: number; type: 'text'; value: string }
  | { ref: number; type: 'select'; index: number }
  | { ref: number; type: 'radio'; index: number }
  | { ref: number; type: 'file' };

// ---------------------------------------------------------------------------
// What the user is shown
// ---------------------------------------------------------------------------

export type FieldStatus =
  /** We wrote an answer and it stuck. */
  | 'filled'
  /** Preview: we will write an answer. */
  | 'fillable'
  /** Recognised, but already answered, so left alone. */
  | 'kept'
  /** Recognised, but the profile has no answer for it. */
  | 'missing'
  /** Recognised choice field, but no single option matches the profile. */
  | 'noOption'
  /** Recognised, but this kind of control is not operated yet (custom dropdown, typeahead…). */
  | 'unsupported'
  /** We tried to write and the control is still empty. */
  | 'failed'
  /** Not recognised; left alone. */
  | 'unknown';

export interface FieldResult {
  /** Identifies the control within its document; matches ScannedField.ref. */
  ref: number;
  documentId: string;
  kind: FieldKind | null;
  control: ControlType;
  /** Text for the user: the field's label, else placeholder, else name. Page-supplied, so always shown as plain text. */
  label: string;
  status: FieldStatus;
  required: boolean;
  /** Whether the control was unanswered when scanned. */
  empty: boolean;
  /**
   * What is (to be) written: the text, the chosen option's label, or the
   * résumé file name. For 'unsupported' and 'missing' rows of a recognised
   * kind it is the answer the user could enter by hand. '' otherwise.
   */
  value: string;
}

export type AtsId =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'icims'
  | 'smartrecruiters'
  | 'workable'
  | 'bamboohr'
  | 'jobvite'
  | 'taleo'
  | 'successfactors';

/** All frames of a tab merged; this is what the popup shows. */
export interface PageReport {
  tabId: number;
  /** URL of the top frame. */
  url: string;
  ats: AtsId | null;
  job: JobInfo;
  /** Origins that will receive (or received) answers, top frame first. */
  origins: string[];
  results: FieldResult[];
  /** Origins of embedded forms on known job sites that could not be read. */
  unreachable: string[];
  /** Embedded frames that were read but are hidden by the page, so nothing is written there. */
  hiddenFrames: number;
}

/** A page's preview plus the actions that a fill would carry out. */
export interface PagePlan {
  report: PageReport;
  documents: DocumentPlan[];
}

// ---------------------------------------------------------------------------
// Messages between the popup and the background service worker
// ---------------------------------------------------------------------------

export type BackgroundRequest =
  /** Look at the tab and report what would be filled. Changes nothing on the page. */
  | { type: 'scan'; tabId: number }
  /** Carry out the plan made by the last scan of this tab. */
  | { type: 'fill'; tabId: number };

export type BackgroundResponse =
  | { ok: true; report: PageReport }
  /** `error` is a sentence that can be shown to the user as is. */
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Function contracts. Each module exports a constant of the matching type,
// e.g. `export const classifyField: ClassifyField = (field) => { … }`, so the
// compiler holds every module to the shape the others rely on.
// ---------------------------------------------------------------------------

/** lib/classify.ts — pure. null whenever unsure. */
export type ClassifyField = (field: FieldDescriptor) => FieldKind | null;

export type ChoicePick =
  /** The profile has no answer for this kind. */
  | { status: 'missing' }
  /** Zero or several options match; nothing is chosen. */
  | { status: 'noOption' }
  | { status: 'match'; index: number };

/** lib/choices.ts — pure. Picks the option of a select or radio group. */
export type PickChoice = (kind: FieldKind, profile: Profile, options: readonly ChoiceOption[]) => ChoicePick;

/** lib/profile.ts — pure. The text to type for a kind; '' when there is nothing safe to write. */
export type TextValueFor = (kind: FieldKind, profile: Profile, field: FieldDescriptor) => string;

/** lib/profile.ts — pure. Builds a valid Profile from anything (storage, an imported file). */
export type NormalizeProfile = (input: unknown) => Profile;

/** lib/plan.ts — pure. Turns the scans of a tab into the preview and the actions. */
export type PlanPage = (
  tabId: number,
  tabUrl: string,
  scans: readonly FrameScanResult[],
  profile: Profile,
  resume: ResumeMeta | null,
) => PagePlan;

/** lib/plan.ts — pure. The report after a fill: 'fillable' rows become 'filled' or 'failed'. */
export type ApplyOutcomes = (
  report: PageReport,
  outcomes: readonly { documentId: string; outcomes: readonly FillOutcome[] }[],
) => PageReport;

/** lib/report.ts — pure. True for rows the user still has to deal with. */
export type NeedsAttention = (result: FieldResult) => boolean;

/** lib/ats.ts — pure, importable from Node (wxt.config.ts uses it). */
export type DetectAts = (url: string) => AtsId | null;

/** The parts of the browser the page-side code cannot do without, injected so the logic runs in unit tests. */
export interface PageEnv {
  /** True when a person could see the element: rendered, not transparent, a real box, inside the page. */
  isRendered: (el: Element) => boolean;
  /** Puts files into a file input (DataTransfer in the browser). */
  assignFiles: (input: HTMLInputElement, files: readonly File[]) => void;
}

/** lib/page/scan.ts — reads one document. Never throws; never changes the page; never sees the profile. */
export type ScanDocument = (doc: Document, env: PageEnv) => FrameScan;

/** lib/page/apply.ts — carries out actions on controls found by the last scan. Never throws. */
export type ApplyActions = (doc: Document, actions: readonly FillAction[], env: PageEnv) => FillOutcome[];

/** lib/page/job.ts — reads the job title and company from a document. */
export type ExtractJob = (doc: Document, ats: AtsId | null) => JobInfo;

/** lib/resume.ts */
export type ResumeToFile = (resume: StoredResume) => File;
export type FileToStoredResume = (file: File, now: number) => Promise<StoredResume>;

// ---------------------------------------------------------------------------
// Page-side building blocks shared between modules in lib/page/
// ---------------------------------------------------------------------------

/** A control found on a page, with its element(s). Page side only; never sent anywhere. */
export type Control =
  | { control: 'text' | 'combobox' | 'file'; el: HTMLInputElement }
  | { control: 'textarea'; el: HTMLTextAreaElement }
  | { control: 'select'; el: HTMLSelectElement }
  /** A radio group: `el` is its first radio, `radios` all of them in document order. */
  | { control: 'radio'; el: HTMLInputElement; radios: HTMLInputElement[] };

/** lib/page/collect.ts — every collectable control in document order, open shadow roots included. Applies the "never collected" list; makes no visibility decision. */
export type CollectControls = (doc: Document) => Control[];
/** lib/page/collect.ts — index of the control's form owner among doc.forms, or -1. Compares `el.form === form`; never reads properties off the form by name. */
export type FormIndex = (control: Control) => number;

/** lib/page/describe.ts */
export type DescribeControl = (control: Control) => FieldDescriptor;
/** lib/page/describe.ts — the "Empty means unanswered" rule in CLAUDE.md. */
export type IsEmpty = (control: Control) => boolean;

/** lib/page/visibility.ts — product rule 4 for one control: markup checks, then `env.isRendered` on the control or, for radios and file inputs, on its visible stand-in. Also false for disabled and read-only controls. */
export type IsShown = (control: Control, env: PageEnv) => boolean;

/** lib/page/refs.ts — the handle table. It lives on globalThis so the scan and fill scripts, which are separate bundles in one isolated world, share it. Remembering replaces the previous table. */
export type RememberControls = (controls: readonly Control[]) => number[];
/** lib/page/refs.ts — null when the handle is unknown or its element has left the document. */
export type RecallControl = (ref: number) => Control | null;

/** lib/page/fill.ts — each returns true when the control holds an answer afterwards. See "Writing" in CLAUDE.md. */
export type FillText = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => boolean;
export type FillSelect = (el: HTMLSelectElement, index: number) => boolean;
export type FillRadio = (radio: HTMLInputElement) => boolean;
export type FillFile = (input: HTMLInputElement, file: File, assignFiles: PageEnv['assignFiles']) => boolean;

/** lib/regions.ts — ISO 3166-1 alpha-2 code of the one country a text names ("US" for "United States", "U.S.", "USA", "America"), or null when it names none or several. */
export type FindCountry = (text: string) => string | null;
/** lib/regions.ts — code for a country as a user or an option list writes it, or null. */
export type CountryCode = (value: string) => string | null;
