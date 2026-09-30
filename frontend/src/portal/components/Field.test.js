import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Field, { SelectField } from './Field';
import NumericField from './NumericField';

// iOS Safari zooms the page into any input under 16px and leaves it zoomed
// (UX review 2026-09-30). Server markup keeps the inline style as written.
test('text, select and numeric inputs are 16px so iPhones do not zoom in on focus', () => {
  expect(renderToStaticMarkup(<Field label="Email" value="" />)).toMatch(/<input[^>]*font:400 16px/);
  expect(renderToStaticMarkup(<SelectField label="Relationship" value="" options={['Mother']} />)).toMatch(/<select[^>]*font:400 16px/);
  expect(renderToStaticMarkup(<NumericField label="Granted" value="6" />)).toMatch(/<input[^>]*font:600 16px/);
});

test('the error row carries data-field-error for the scroll-to-first-error', () => {
  expect(renderToStaticMarkup(<Field label="Mobile" value="" error="A mobile number is required." />)).toContain('data-field-error');
  expect(renderToStaticMarkup(<Field label="Mobile" value="" hint="Used for texts." />)).not.toContain('data-field-error');
});
