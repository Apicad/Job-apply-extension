// Collects what a page is made of: its form fields, buttons, links, headings and metadata.
//
// The popup injects this function into the page with chrome.scripting.executeScript, which
// sends only the function's own source text. Everything it needs must therefore live inside
// it: no imports, and no references to anything declared outside the function body.

export function extractPageInfo() {
  const BUTTON_INPUTS = ['submit', 'button', 'reset', 'image'];
  const WIDGET_ROLES = ['textbox', 'searchbox', 'combobox', 'listbox', 'spinbutton', 'slider', 'checkbox', 'radio', 'switch'];
  // Roles whose element carries its own name as text, the way a <button> does.
  const SELF_NAMED_ROLES = ['checkbox', 'radio', 'switch'];
  // Attributes sites add for their own automated tests. They tend to outlive redesigns, and
  // on some sites the ids are generated and differ on every visit.
  const TEST_HOOKS = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy', 'data-automation-id'];

  // A <form> exposes its controls as properties named after them, ahead of its own: in a form
  // with a control called "children", form.children is that control, not the list of child
  // elements. The two members this function reads from elements that may be forms are
  // therefore taken from the prototype. (Attributes are read with getAttribute throughout
  // for the same reason.)
  const matchesOnPrototype = Element.prototype.matches;
  const childrenOnPrototype = Object.getOwnPropertyDescriptor(Element.prototype, 'children').get;
  const matches = (el, selector) => matchesOnPrototype.call(el, selector);
  const childrenOf = (parent) => (parent instanceof Element ? childrenOnPrototype.call(parent) : parent.children);

  // Every element in reading order, including those inside shadow roots, which
  // document.querySelectorAll cannot reach.
  const everything = [];
  const shadowRoots = [];
  // An extension can also see into closed shadow roots; an ordinary page script cannot.
  const canOpenClosedRoots = Boolean(globalThis.chrome?.dom?.openOrClosedShadowRoot);
  const shadowRootOf = (el) =>
    el.shadowRoot ?? (canOpenClosedRoots && el instanceof HTMLElement ? chrome.dom.openOrClosedShadowRoot(el) : null);
  (function collect(root) {
    for (const el of root.querySelectorAll('*')) {
      everything.push(el);
      const shadowRoot = shadowRootOf(el);
      if (shadowRoot) {
        shadowRoots.push(shadowRoot);
        collect(shadowRoot);
      }
    }
  })(document);

  const query = (selector) => everything.filter((el) => matches(el, selector));

  // Each part of the capture is read on its own, so that a page odd enough to trip one part
  // still gives up the rest.
  const problems = [];
  function attempt(part, read, otherwise) {
    try {
      return read();
    } catch (error) {
      problems.push(`${part}: ${error?.message ?? error}`);
      return otherwise;
    }
  }

  /** Text of a node, with runs of whitespace collapsed. */
  const textOf = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** `value` as a quoted CSS string. */
  const quote = (value) => `"${value.replace(/["\\]/g, '\\$&')}"`;

  /** Resolves an address against the page's, the way the browser would. */
  function absolute(address) {
    try {
      return new URL(address, document.baseURI).href;
    } catch {
      return address;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------------------

  /** The short selectors that might single `el` out: a test hook, its id, its name. */
  function shortSelectorsFor(el) {
    const selectors = [];
    for (const hook of TEST_HOOKS) {
      const value = el.getAttribute(hook);
      if (value) selectors.push(`[${hook}=${quote(value)}]`);
    }
    const id = el.getAttribute('id');
    if (id) selectors.push(`#${CSS.escape(id)}`);
    const name = el.getAttribute('name');
    if (name) {
      const named = `${CSS.escape(el.localName)}[name=${quote(name)}]`;
      selectors.push(named);
      // Radios, checkboxes and buttons share a name and differ by value. (Not text fields:
      // their value attribute is whatever was filled in.)
      const value = el.getAttribute('value');
      const valueIsFixed =
        el.localName === 'button' || (el.localName === 'input' && ['radio', 'checkbox', ...BUTTON_INPUTS].includes(el.type));
      if (value !== null && valueIsFixed) selectors.push(`${named}[value=${quote(value)}]`);
    }
    return selectors;
  }

  // How many elements each short selector matches, counted once per document or shadow root.
  // Testing each candidate with querySelectorAll instead would rescan the page for every
  // control: seconds on a big table.
  const shortSelectors = new Map(); // element -> its short selectors
  const uses = new Map(); // document or shadow root -> Map(selector -> how many elements it matches)
  for (const el of everything) {
    const selectors = shortSelectorsFor(el);
    if (!selectors.length) continue;
    shortSelectors.set(el, selectors);
    const root = el.getRootNode();
    if (!uses.has(root)) uses.set(root, new Map());
    const counts = uses.get(root);
    for (const selector of selectors) counts.set(selector, (counts.get(selector) ?? 0) + 1);
  }

  /** A short selector that matches `el` alone, if it has one. */
  function distinctiveSelector(el) {
    const counts = uses.get(el.getRootNode());
    return shortSelectors.get(el)?.find((selector) => counts.get(selector) === 1);
  }

  // Where each element stands among its same-named siblings, worked out one parent at a time.
  const places = new Map(); // element -> [its number among them, the counts for its parent]
  function placeOf(el) {
    if (!places.has(el)) {
      const counts = new Map();
      for (const child of childrenOf(el.parentNode)) {
        counts.set(child.localName, (counts.get(child.localName) ?? 0) + 1);
        places.set(child, [counts.get(child.localName), counts]);
      }
    }
    const [number, counts] = places.get(el);
    return [number, counts.get(el.localName)];
  }

  /** A CSS selector that matches `el` and nothing else in its document or shadow root. */
  function selectorWithinRoot(el) {
    // Climb until something distinctive turns up, noting the position of each step on the way.
    const steps = [];
    for (let node = el; node; node = node.parentElement) {
      const distinctive = distinctiveSelector(node);
      if (distinctive) return [distinctive, ...steps].join(' > ');
      const [number, twins] = placeOf(node);
      const tag = CSS.escape(node.localName);
      steps.unshift(twins > 1 ? `${tag}:nth-of-type(${number})` : tag);
    }
    // Nothing distinctive all the way up. In a document the path starts at <html>; in a shadow
    // root it has to be tied to the host, or it would also match the same shape further down.
    return `${el.getRootNode() instanceof ShadowRoot ? ':host > ' : ''}${steps.join(' > ')}`;
  }

  /**
   * A selector that matches `el` and nothing else. For an element inside a shadow root it is
   * one selector per root, joined by " >>> ": `#host >>> #field` means the element matching
   * #field inside the shadow root of the element matching #host.
   */
  function selectorFor(el) {
    const steps = [];
    for (let node = el; node; ) {
      steps.unshift(selectorWithinRoot(node));
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return steps.join(' >>> ');
  }

  // ---------------------------------------------------------------------------------------
  // What a person can see
  // ---------------------------------------------------------------------------------------

  function isVisible(el) {
    if (!el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) return false;
    const box = el.getBoundingClientRect();
    // A box no bigger than a pixel is the usual way to hide something from sight only.
    if (box.width <= 1 || box.height <= 1) return false;
    // Parked beyond the top or left edge of the page, where no amount of scrolling reaches it.
    return box.right + window.scrollX > 0 && box.bottom + window.scrollY > 0;
  }

  // Which <label>s belong to which control, worked out in one pass. Asking each control for
  // el.labels makes the browser rescan the page every time: seconds on a large form.
  const labelsByControl = new Map();
  for (const label of query('label')) {
    const control = label.control;
    if (control) labelsByControl.set(control, [...(labelsByControl.get(control) ?? []), label]);
  }
  const labelsOf = (el) => labelsByControl.get(el) ?? [];

  function isShown(el) {
    // Hidden from assistive technology: a prop for some widget, not a field to fill.
    if (el.closest('[aria-hidden="true"]')) return false;
    // File pickers, radios and checkboxes are routinely made invisible (see-through, or a
    // pixel wide) with a styled stand-in on top, so only being left out of the page counts.
    const hasStandIn = el.localName === 'input' && ['file', 'radio', 'checkbox'].includes(el.type);
    if (hasStandIn ? el.checkVisibility({ checkVisibilityCSS: true }) : isVisible(el)) return true;
    // Otherwise the control still counts if its label is what the person sees and clicks.
    return labelsOf(el).some(isVisible);
  }

  const isDisabled = (el) => matches(el, ':disabled') || el.getAttribute('aria-disabled') === 'true';
  const isRequired = (el) => el.required === true || el.getAttribute('aria-required') === 'true';

  // ---------------------------------------------------------------------------------------
  // Names
  // ---------------------------------------------------------------------------------------

  // Many forms mark a required field only with an asterisk: closing its label, or standing
  // alone inside it (though not between two numbers, where it means "times"). Some draw it
  // with a heavier glyph.
  const LAST_STAR = /[*✱＊]$/;
  const LONE_STAR = /(?<!\d)(^|\s)[*✱＊](?=\s|$)(?!\s\d)/g;
  const isStarred = (label) => LAST_STAR.test(label) || label.search(LONE_STAR) !== -1;
  const withoutStar = (label) => label.replace(LONE_STAR, '$1').replace(LAST_STAR, '').replace(/\s+/g, ' ').trim();

  /**
   * The text inside `node` as a person sees it: nothing from hidden parts, nested controls or
   * icons, and a space wherever a line or a block begins or ends.
   */
  function visibleText(node) {
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.data;
      } else if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      } else if (child.localName === 'br') {
        text += ' ';
      } else if (
        !matches(child, 'input, select, textarea, button, svg, script, style') &&
        child.checkVisibility({ checkVisibilityCSS: true })
      ) {
        const inner = visibleText(child);
        text += getComputedStyle(child).display.startsWith('inline') ? inner : ` ${inner} `;
      }
    }
    return text;
  }
  const seenText = (node) => visibleText(node).replace(/\s+/g, ' ').trim();

  function labelText(label) {
    const seen = seenText(label);
    if (seen) return seen;
    // A label that is hidden altogether still names its control.
    const copy = label.cloneNode(true);
    for (const control of copy.querySelectorAll('input, select, textarea, button')) control.remove();
    return textOf(copy);
  }

  /** The name the page gives this control, in the order screen readers look for one, or ''. */
  function nameOf(el) {
    const root = el.getRootNode();
    const labelledBy = (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => id && textOf(root.getElementById(id)))
      .filter(Boolean)
      .join(' ');
    if (labelledBy) return labelledBy;

    const ariaLabel = el.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;

    const labels = labelsOf(el).map(labelText).filter(Boolean).join(' ');
    if (labels) return labels;

    // A custom radio, checkbox or switch says its own name, as a button does.
    const saysItsOwnName =
      !['input', 'select', 'textarea'].includes(el.localName) && SELF_NAMED_ROLES.includes(el.getAttribute('role'));
    return saysItsOwnName ? seenText(el) : '';
  }

  /** The element that gathers a set of radios or checkboxes under one question, if any. */
  const groupOf = (el) => el.closest('fieldset, [role="radiogroup"], [role="group"]');

  /** The question a group of radios or checkboxes answers. */
  function groupLabelOf(el) {
    const group = groupOf(el);
    if (!group) return '';
    return textOf(group.querySelector(':scope > legend')) || nameOf(group);
  }

  /**
   * For a control the page does not name: the text a person reads just before it. Looks at
   * what comes before `start`, then before each element around it, and gives up on meeting
   * another control, because from there on the text belongs to that one. Never looks outside
   * the form. `ownLabels` are labels of the control itself (a group's choices), to be skipped.
   */
  function nearbyText(start, ownLabels = []) {
    const FIELD = ['input:not([type="hidden"])', 'select', 'textarea', ...WIDGET_ROLES.map((role) => `[role="${role}"]`)].join(', ');
    const LONGEST = 1000; // characters; anything longer is a passage, not the name of a field
    for (let node = start, climbs = 0; node && !matches(node, 'form, body') && climbs < 6; node = node.parentElement, climbs += 1) {
      for (let before = node.previousSibling; before; before = before.previousSibling) {
        let text = '';
        if (before.nodeType === Node.TEXT_NODE) {
          text = before.data.replace(/\s+/g, ' ').trim();
        } else if (before.nodeType === Node.ELEMENT_NODE && before.checkVisibility({ checkVisibilityCSS: true })) {
          if (ownLabels.some((label) => before === label || before.contains(label))) continue;
          if (matches(before, `${FIELD}, button, [role="button"]`) || before.querySelector(FIELD)) return '';
          // Do not walk a whole article just to find out it is too long.
          if (before.textContent.length > 10 * LONGEST) return '';
          text = seenText(before);
        }
        if (text) return text.length > LONGEST ? '' : text;
      }
    }
    return '';
  }

  // ---------------------------------------------------------------------------------------
  // Fields
  // ---------------------------------------------------------------------------------------

  /** What kind of field this element is, or null if it is not one. */
  function fieldType(el) {
    if (el.localName === 'input') {
      return el.type === 'hidden' || BUTTON_INPUTS.includes(el.type) ? null : el.type;
    }
    if (el.localName === 'select' || el.localName === 'textarea') return el.localName;
    const role = el.getAttribute('role');
    if (WIDGET_ROLES.includes(role)) return role;
    // The editable region itself, not every element inside it.
    return el.hasAttribute('contenteditable') && el.isContentEditable ? 'contenteditable' : null;
  }

  const formElements = query('form');

  /** Position in `forms` of the form `el` belongs to, or null. */
  function formOf(el) {
    const index = formElements.indexOf(el.form ?? el.closest('form'));
    return index === -1 ? null : index;
  }

  function describeField(el, type) {
    const name = nameOf(el);
    const label = name || el.getAttribute('placeholder')?.trim() || el.getAttribute('title')?.trim() || '';
    const visible = isShown(el);
    // Only a guess, so it is reported beside the label rather than as one, and never decides
    // whether the field is required. And only for a control people can see: nothing on the
    // page is addressed to a hidden one.
    const nearby = name || !visible ? '' : withoutStar(nearbyText(el));
    const field = {
      label: withoutStar(label),
      ...(nearby && { nearbyText: nearby }),
      type,
      name: el.getAttribute('name') ?? '',
      id: el.id,
      selector: selectorFor(el),
      required: isRequired(el) || isStarred(label),
      disabled: isDisabled(el),
      visible,
      form: formOf(el),
    };
    const role = el.getAttribute('role');
    if (role && role !== type) field.role = role;
    for (const attribute of ['placeholder', 'autocomplete', 'accept']) {
      const value = el.getAttribute(attribute);
      if (value) field[attribute] = value;
    }
    if (el.multiple) field.multiple = true;
    if (el.readOnly) field.readonly = true;
    if (el.localName === 'select') {
      field.options = [...el.options].map((option) => ({ label: option.label, value: option.value }));
    }
    return field;
  }

  /** One field for a whole set of radios or checkboxes; each option says how to reach its control. */
  function describeGroup(members, type) {
    const [first] = members;
    const label = groupLabelOf(first);
    const visible = members.some(isShown);
    // The choices' own labels are not the question, however close they sit: start outside
    // the first one's label if it is wrapped in it, and step over the others on the way.
    const ownLabels = members.flatMap(labelsOf);
    const start = ownLabels.find((label) => label.contains(first)) ?? first;
    const nearby = label || !visible ? '' : withoutStar(nearbyText(start, ownLabels));
    return {
      label: withoutStar(label),
      ...(nearby && { nearbyText: nearby }),
      type,
      name: first.getAttribute('name') ?? '',
      required: members.some(isRequired) || isStarred(label) || groupOf(first)?.getAttribute('aria-required') === 'true',
      disabled: members.every(isDisabled),
      visible,
      form: formOf(first),
      options: members.map((el) => ({ label: nameOf(el), value: el.value ?? '', selector: selectorFor(el) })),
    };
  }

  function readFields() {
    const controls = [];
    // Radios and checkboxes that answer one question together: native ones share a form and a
    // name; custom ones share a radiogroup element.
    const groups = new Map();
    for (const el of query('input, select, textarea, [contenteditable], [role]')) {
      const type = fieldType(el);
      if (!type) continue;
      const name = el.getAttribute('name');
      let key = null;
      if (el.localName !== 'input') key = type === 'radio' ? el.closest('[role="radiogroup"]') : null;
      else if ((type === 'radio' || type === 'checkbox') && name) key = `${formOf(el)}|${type}|${name}`;
      if (key) groups.set(key, [...(groups.get(key) ?? []), el]);
      controls.push({ el, type, key });
    }

    const fields = [];
    for (const { el, type, key } of controls) {
      const members = key && groups.get(key);
      // Radios always answer as a group; checkboxes only when several share a name.
      if (!members || (type === 'checkbox' && members.length === 1)) fields.push(describeField(el, type));
      else if (members[0] === el) fields.push(describeGroup(members, type));
    }
    return fields;
  }

  function readButtons() {
    const BROWSER_TEXT = { submit: 'Submit', reset: 'Reset' }; // what a bare <input type="submit"> shows
    return query('button, input, [role="button"]')
      .filter((el) => el.localName !== 'input' || BUTTON_INPUTS.includes(el.type))
      .map((el) => ({
        text:
          textOf(el) ||
          el.value ||
          el.getAttribute('aria-label') ||
          el.title ||
          el.alt ||
          (el.localName === 'input' && BROWSER_TEXT[el.type]) ||
          '',
        type: el.localName === 'button' || el.localName === 'input' ? el.type : 'button',
        selector: selectorFor(el),
        disabled: isDisabled(el),
        form: formOf(el),
      }));
  }

  // ---------------------------------------------------------------------------------------
  // Frames
  // ---------------------------------------------------------------------------------------

  /** Position of `frame` among the frames of its parent window, or -1. Works across sites. */
  function positionAmongFrames(frame, parent) {
    for (let index = 0; index < parent.length; index += 1) {
      if (parent[index] === frame) return index;
    }
    return -1;
  }

  /**
   * Where this document sits among the page's frames: [] for the page itself, [2, 0] for the
   * first frame inside the page's third frame. It lets the popup tell exactly which embedded
   * frames were read and which were not.
   */
  function readFramePath() {
    const path = [];
    for (let frame = window; frame !== frame.parent; frame = frame.parent) {
      path.unshift(positionAmongFrames(frame, frame.parent));
    }
    return path;
  }

  function readFrames() {
    return query('iframe, frame, object')
      .filter((frame) => frame.contentWindow)
      .map((frame) => {
        const box = frame.getBoundingClientRect();
        return {
          // <object> keeps its address in `data`.
          src: frame.src || (frame.data ? absolute(frame.data) : ''),
          title: frame.title,
          index: positionAmongFrames(frame.contentWindow, window),
          width: Math.round(box.width),
          height: Math.round(box.height),
          visible: isVisible(frame),
        };
      });
  }

  // ---------------------------------------------------------------------------------------
  // The rest of the page
  // ---------------------------------------------------------------------------------------

  /** The page's HTML as it stands now, scripts' changes included. */
  function readHtml() {
    const root = document.documentElement;
    let html;
    if (shadowRoots.length && root.getHTML) {
      // outerHTML leaves shadow roots out. getHTML can include them, but returns only what is
      // inside <html>, so the <html ...> tag itself comes from an empty copy of the element.
      const shell = root.cloneNode(false).outerHTML;
      html = `${shell.slice(0, -'</html>'.length)}${root.getHTML({ shadowRoots })}</html>`;
    } else {
      html = root.outerHTML;
    }
    // A password has no business in a copy of the page. The value attribute is what a framework
    // mirrors into the markup. The value property is what the person typed, or what a script set,
    // and it may appear in the copy even when the attribute was never written (a script on the
    // page, a serializer that records the property). Neither is left in. The live control is not
    // touched. A field switched to plain text by a "show" toggle counts when it is marked as a
    // password field.
    const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    for (const input of query('input[type="password" i], input[autocomplete*="password" i]')) {
      if (input.hasAttribute('value')) {
        const blanked = input.cloneNode(false);
        blanked.setAttribute('value', '');
        html = html.split(input.outerHTML).join(blanked.outerHTML);
      }
      const typed = input.value;
      if (typed) {
        html = html.split(typed).join('');
        const escaped = escapeHtml(typed);
        if (escaped !== typed) html = html.split(escaped).join('');
      }
    }
    const doctype = document.doctype ? `${new XMLSerializer().serializeToString(document.doctype)}\n` : '';
    return doctype + html;
  }

  function readMeta() {
    const meta = {};
    for (const tag of query('meta[name], meta[property]')) {
      const key = tag.getAttribute('name') || tag.getAttribute('property');
      if (key && !Object.hasOwn(meta, key)) meta[key] = tag.getAttribute('content') ?? '';
    }
    return meta;
  }

  function readJsonLd() {
    const blocks = [];
    for (const script of query('script[type="application/ld+json" i]')) {
      try {
        blocks.push(JSON.parse(script.textContent));
      } catch {
        // Not valid JSON: nothing useful to report.
      }
    }
    return blocks;
  }

  const readHeadings = () =>
    query('h1, h2, h3, h4, h5, h6')
      .map((el) => ({ level: Number(el.localName[1]), text: textOf(el) }))
      .filter((heading) => heading.text);

  const readLinks = () =>
    query('a[href]')
      // A link drawn inside an svg keeps its address in an object rather than a string.
      .map((a) => ({ a, href: typeof a.href === 'string' ? a.href : absolute(a.getAttribute('href')) }))
      .filter(({ href }) => !href.startsWith('javascript:'))
      .map(({ a, href }) => ({
        text: textOf(a) || a.getAttribute('aria-label') || a.title || a.querySelector('img[alt]')?.alt || '',
        href,
      }));

  const readForms = () =>
    formElements.map((form) => ({
      selector: selectorFor(form),
      id: form.getAttribute('id') ?? '',
      name: form.getAttribute('name') ?? '',
      action: form.hasAttribute('action') ? absolute(form.getAttribute('action')) : '',
      method: (form.getAttribute('method') || 'get').toLowerCase(),
    }));

  const info = {
    url: location.href,
    // Not document.title: an element named "title" would shadow it.
    title: attempt('title', () => textOf(query('head > title')[0]), ''),
    lang: document.documentElement.lang,
    canonical: attempt('canonical', () => query('link[rel~="canonical" i][href]')[0]?.href ?? '', ''),
    framePath: attempt('frame path', readFramePath, []),
    meta: attempt('meta', readMeta, {}),
    jsonLd: attempt('JSON-LD', readJsonLd, []),
    headings: attempt('headings', readHeadings, []),
    links: attempt('links', readLinks, []),
    forms: attempt('forms', readForms, []),
    fields: attempt('fields', readFields, []),
    buttons: attempt('buttons', readButtons, []),
    iframes: attempt('frames', readFrames, []),
    html: attempt('html', readHtml, ''),
  };
  if (problems.length) info.problems = problems;
  return info;
}
