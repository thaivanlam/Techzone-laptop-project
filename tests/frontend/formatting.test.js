/**
 * Unit tests for the single-page application's display helpers.
 *
 * Level: unit. These are the functions that turn numbers and long strings into what the
 * customer actually reads on a product card, so a rounding slip here is a wrong price on
 * the screen. Pure functions, no rendering, no network.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPrice,
  formatPriceCalculation,
  formatRevenue,
} from '../../frontend/src/utils/formatPrice.js';
import { truncateText } from '../../frontend/src/utils/truncateText.js';

describe('Unit - formatPrice', () => {
  it('renders a price as US currency', () => {
    assert.equal(formatPrice(1080), '$1,080.00');
  });

  it('always shows two decimal places', () => {
    assert.equal(formatPrice(1080.5), '$1,080.50');
    assert.equal(formatPrice(0), '$0.00');
  });

  it('groups thousands so a four-figure laptop is readable', () => {
    assert.match(formatPrice(2499.99), /^\$2,499\.99$/);
  });

  it('rounds to the cent rather than showing a long fraction', () => {
    assert.equal(formatPrice(1080.005), '$1,080.01');
    assert.equal(formatPrice(1079.994), '$1,079.99');
  });
});

describe('Unit - formatPriceCalculation', () => {
  it('multiplies a quantity by a unit price', () => {
    assert.equal(formatPriceCalculation(3, 900), '2700.00');
  });

  it('copes with the string values that arrive from form inputs', () => {
    assert.equal(formatPriceCalculation('2', '1080.50'), '2161.00');
  });

  it('returns a two-decimal string, not a number', () => {
    const result = formatPriceCalculation(1, 900);

    assert.equal(typeof result, 'string');
    assert.equal(result, '900.00');
  });

  it('gives zero for an empty line', () => {
    assert.equal(formatPriceCalculation(0, 900), '0.00');
  });
});

describe('Unit - formatRevenue', () => {
  it('leaves a small figure alone', () => {
    assert.equal(formatRevenue(999), 999);
  });

  it('abbreviates thousands', () => {
    assert.equal(formatRevenue(1500), '1.5K');
    assert.equal(formatRevenue(1000), '1.0K');
  });

  it('abbreviates millions', () => {
    assert.equal(formatRevenue(2_400_000), '2.4M');
  });

  it('abbreviates billions', () => {
    assert.equal(formatRevenue(3_200_000_000), '3.2B');
  });

  it('switches unit exactly at each threshold', () => {
    assert.equal(formatRevenue(999_999), '1000.0K');
    assert.equal(formatRevenue(1_000_000), '1.0M');
  });
});

describe('Unit - truncateText', () => {
  it('leaves a short description untouched', () => {
    assert.equal(truncateText('A gaming laptop'), 'A gaming laptop');
  });

  it('cuts a long description and marks the cut', () => {
    const long = 'x'.repeat(200);

    const result = truncateText(long);

    assert.equal(result.length, 93, '90 characters plus the ellipsis');
    assert.ok(result.endsWith('...'));
  });

  it('honours a custom limit', () => {
    assert.equal(truncateText('abcdefghij', 4), 'abcd...');
  });

  it('does not cut text that is exactly at the limit', () => {
    assert.equal(truncateText('abcd', 4), 'abcd');
  });

  it('passes undefined through instead of throwing', () => {
    assert.equal(truncateText(undefined), undefined);
  });
});
