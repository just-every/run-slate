import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseFragment } from 'parse5';
import { AccessExpiry } from '../../../src/core/app/ui/AccessExpiry';
import { displayDate, parseAccessExpiry } from '../../../src/core/app/ui/displayDate';

function inputs(markup: string): Array<Record<string, string>> {
  const found: Array<Record<string, string>> = [];
  function visit(node: unknown) {
    const element = node as { tagName?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: unknown[] };
    if (element.tagName === 'input') found.push(Object.fromEntries((element.attrs ?? []).map(attribute => [attribute.name, attribute.value])));
    for (const child of element.childNodes ?? []) visit(child);
  }
  visit(parseFragment(markup));
  return found;
}

test('access expiry round-trips every month through the displayed local date and rendered ISO field', () => {
  for (let month = 0; month < 12; month++) {
    const instant = new Date(2028, month, 15, 16, 30).toISOString();
    const shown = displayDate(instant, true);
    assert.equal(parseAccessExpiry(shown), instant, `month ${month + 1}: ${shown}`);
    const fields = inputs(renderToStaticMarkup(createElement(AccessExpiry, { name: 'expiresAt', value: instant })));
    const visible = fields.find(field => field['aria-label'] === 'Access expiry date and time');
    const submitted = fields.find(field => field.type === 'hidden' && field.name === 'expiresAt');
    assert.ok(visible && submitted);
    assert.equal(visible.value, shown);
    assert.equal(submitted.value, instant, 'The date the owner sees must be the expiry sent to the server.');
    assert.equal(parseAccessExpiry(visible.value!), submitted.value);
  }
});

test('both September abbreviations refer to the same expiry instant', () => {
  const instant = new Date(2028, 8, 15, 16, 30).toISOString();
  for (const month of ['Sep', 'Sept', 'sep', 'SEPT']) {
    assert.equal(parseAccessExpiry(`15 ${month} 2028, 16:30`), instant);
  }
});

test('invalid calendar dates, years, months and times are rejected without normalization', () => {
  const invalid = [
    '00 Jan 2028, 16:30', '32 Jan 2028, 16:30',
    '31 Apr 2028, 16:30', '31 Jun 2028, 16:30', '31 Sep 2028, 16:30', '31 Nov 2028, 16:30',
    '30 Feb 2028, 16:30', '15 Jan 0000, 16:30', '15 Jan 0099, 16:30', '15 Jan 0999, 16:30',
    '15 Jan 10000, 16:30', '15 Foo 2028, 16:30', '15 January 2028, 16:30', '15 13 2028, 16:30',
    '15 Jan 2028, 24:00', '15 Jan 2028, 16:60', '15 Jan 2028, -1:30', '15 Jan 2028, 16:-1',
    '15 Jan 2028, 16:30 trailing text', '2028-01-15T16:30:00Z',
  ];
  for (const value of invalid) assert.equal(parseAccessExpiry(value), undefined, value);
});

test('29 February is accepted only in a leap year, including century boundaries', () => {
  for (const year of [2024, 2028, 2000, 2400]) {
    assert.equal(parseAccessExpiry(`29 Feb ${year}, 16:30`), new Date(year, 1, 29, 16, 30).toISOString());
  }
  for (const year of [2023, 2025, 1900, 2100, 2200]) {
    assert.equal(parseAccessExpiry(`29 Feb ${year}, 16:30`), undefined);
  }
});

test('an empty optional expiry clears access expiry while invalid text remains distinct', () => {
  for (const empty of ['', ' ', '\t\n']) assert.equal(parseAccessExpiry(empty), null);
  assert.equal(parseAccessExpiry('not a date'), undefined);
  const fields = inputs(renderToStaticMarkup(createElement(AccessExpiry, { name: 'expiresAt', value: null })));
  assert.equal(fields.find(field => field.type === 'hidden' && field.name === 'expiresAt')?.value, '');
  assert.equal(fields.find(field => field['aria-label'] === 'Access expiry date and time')?.value, '');
});
