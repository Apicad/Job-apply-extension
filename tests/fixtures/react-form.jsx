// The form on react.html: a real React 19 form in which every control is driven by state.
//
// What a filler has to cope with here:
// - A text box shows `values[field]`. Writing to input.value from outside changes what the DOM
//   holds, but unless React receives an event it accepts, the state stays as it was and the next
//   render puts the old text back.
// - The <select> and the radio group are controlled the same way.
// - A field is marked "touched" when it loses focus (onBlur), and only a touched field shows its
//   validation message. A filler that never focuses or blurs anything leaves `touched` all false.
//
// <pre id="state"> shows the component's state as JSON, so a test can read what React itself
// believes instead of what the DOM shows.
//
// This file is .jsx, not .tsx, on purpose: the project's type checker does not look at it. Vite
// transforms it when the fixture server serves it. `React` is imported although the automatic JSX
// transform does not need it, so that the file also works under the classic transform.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', country: '', authorized: '' };
const UNTOUCHED = { firstName: false, lastName: false, email: false, phone: false, country: false, authorized: false };

const COUNTRIES = [
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
];

/** The message for a field's current value, or '' when the value is fine. */
function problemWith(field, value) {
  if (value.trim() === '') return 'This field is required.';
  if (field === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'Enter an e-mail address.';
  return '';
}

function TextField({ id, label, type, autoComplete, value, error, onChange, onBlur }) {
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={error !== ''}
        aria-describedby={error !== '' ? `${id}-error` : undefined}
        onChange={onChange}
        onBlur={onBlur}
      />
      {error !== '' && (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ApplicationForm() {
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState(UNTOUCHED);

  const change = (field) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
  };
  const blur = (field) => () => {
    setTouched((current) => ({ ...current, [field]: true }));
  };
  // Only a field the user has left shows its message.
  const errorFor = (field) => (touched[field] ? problemWith(field, values[field]) : '');

  const submit = (event) => {
    event.preventDefault();
    // Nothing is ever sent anywhere: a submit only leaves a mark for the tests.
    window.__fixture.submitted = true;
    setTouched({ firstName: true, lastName: true, email: true, phone: true, country: true, authorized: true });
  };

  return (
    <form id="react-application" noValidate onSubmit={submit}>
      <TextField
        id="first-name"
        label="First name"
        type="text"
        autoComplete="given-name"
        value={values.firstName}
        error={errorFor('firstName')}
        onChange={change('firstName')}
        onBlur={blur('firstName')}
      />
      <TextField
        id="last-name"
        label="Last name"
        type="text"
        autoComplete="family-name"
        value={values.lastName}
        error={errorFor('lastName')}
        onChange={change('lastName')}
        onBlur={blur('lastName')}
      />
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        error={errorFor('email')}
        onChange={change('email')}
        onBlur={blur('email')}
      />
      <TextField
        id="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        value={values.phone}
        error={errorFor('phone')}
        onChange={change('phone')}
        onBlur={blur('phone')}
      />

      {/* A controlled native select. Its first option is a prompt with an empty value. */}
      <div className="row">
        <label htmlFor="country">Country</label>
        <select
          id="country"
          name="country"
          autoComplete="country"
          value={values.country}
          aria-invalid={errorFor('country') !== ''}
          onChange={change('country')}
          onBlur={blur('country')}
        >
          <option value="">Select a country</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
        {errorFor('country') !== '' && (
          <p className="error" id="country-error" role="alert">
            {errorFor('country')}
          </p>
        )}
      </div>

      {/* A controlled radio group: each radio is checked only while the state says so. */}
      <fieldset>
        <legend>Are you legally authorized to work in the United States?</legend>
        <label>
          <input
            type="radio"
            id="authorized-yes"
            name="authorized"
            value="yes"
            checked={values.authorized === 'yes'}
            onChange={change('authorized')}
            onBlur={blur('authorized')}
          />
          Yes
        </label>
        <label>
          <input
            type="radio"
            id="authorized-no"
            name="authorized"
            value="no"
            checked={values.authorized === 'no'}
            onChange={change('authorized')}
            onBlur={blur('authorized')}
          />
          No
        </label>
        {errorFor('authorized') !== '' && (
          <p className="error" id="authorized-error" role="alert">
            {errorFor('authorized')}
          </p>
        )}
      </fieldset>

      <button type="submit">Send application</button>

      {/* What React believes, for the tests. */}
      <pre id="state">{JSON.stringify({ values, touched }, null, 2)}</pre>
    </form>
  );
}

createRoot(document.getElementById('root')).render(<ApplicationForm />);
