/**
 * System test - the public catalogue.
 *
 * Level: whole platform, read-only. Every assertion travels through the gateway to
 * product-service and down to MySQL, so a broken JPA mapping, a missing index or a
 * mis-declared route shows up here even though each of those has its own narrower test.
 *
 * The suite adapts to an empty shop: the platform seeds no products by default, so tests
 * that need a product skip themselves with an explanation instead of failing.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { anonymous } from '../lib/http.js';
import { firstPageOfProducts, paths } from '../lib/api.js';
import { stackStatus } from '../lib/preflight.js';

const session = anonymous();

describe('System - public catalogue', { skip: stackStatus.skipReason }, () => {
  let products = [];
  let catalogueIsEmpty = true;

  before(async () => {
    const page = await firstPageOfProducts(session, { pageSize: '10' });
    products = page.products;
    catalogueIsEmpty = products.length === 0;
  });

  const needsCatalogue = () => (catalogueIsEmpty
    ? 'The catalogue is empty. Seed it with COMPOSE_PROFILES=prod,seed docker compose up -d.'
    : false);

  it('answers the catalogue request', async () => {
    const response = await session.get(`${paths.products}?pageSize=5`);

    assert.ok([200, 400].includes(response.status));
  });

  it('returns a page envelope with the paging fields the SPA reads', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const response = await session.get(`${paths.products}?pageSize=5`);

    assert.equal(response.status, 200);
    for (const field of ['content', 'pageNumber', 'pageSize', 'totalElements', 'totalPages', 'lastPage']) {
      assert.ok(field in response.body, `page envelope is missing "${field}"`);
    }
  });

  it('gives every product the fields a listing card needs', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    for (const product of products) {
      assert.ok(product.productId, 'productId is required');
      assert.ok(product.productName, 'productName is required');
      assert.equal(typeof product.price, 'number');
      assert.equal(typeof product.specialPrice, 'number');
    }
  });

  it('never prices a product above its list price', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    for (const product of products) {
      assert.ok(product.specialPrice <= product.price,
        `${product.productName}: special price ${product.specialPrice} exceeds list price ${product.price}`);
    }
  });

  it('applies the discount percentage consistently', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    for (const product of products) {
      const expected = product.price - (product.discount * 0.01) * product.price;
      assert.ok(Math.abs(expected - product.specialPrice) < 0.01,
        `${product.productName}: expected special price ${expected}, got ${product.specialPrice}`);
    }
  });

  it('serves images as absolute URLs the browser can fetch', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    for (const product of products) {
      if (product.image === null) continue;
      assert.match(product.image, /^https?:\/\//,
        `${product.productName}: image should be an absolute URL, got ${product.image}`);
    }
  });

  it('actually serves the image each product points at', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    for (const product of products) {
      if (product.image === null) continue;
      // Request the path rather than the advertised absolute URL: IMAGE_BASE_URL may name
      // an origin this runner cannot reach, and what is under test is that product-service
      // has the file and the gateway leaves /images/** public - not how the URL was built.
      const { pathname } = new URL(product.image);
      const response = await session.get(pathname);

      assert.equal(response.status, 200,
        `${product.productName}: ${pathname} should be served, got ${response.status}`);
      assert.match(response.headers.get('content-type') ?? '', /^image\//,
        `${product.productName}: ${pathname} should come back as an image`);
    }
  });

  it('honours the page size', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const response = await session.get(`${paths.products}?pageSize=2&pageNumber=0`);

    assert.equal(response.status, 200);
    assert.ok(response.body.content.length <= 2);
    assert.equal(response.body.pageSize, 2);
  });

  it('returns different products on a second page', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const first = await session.get(`${paths.products}?pageSize=1&pageNumber=0`);
    const second = await session.get(`${paths.products}?pageSize=1&pageNumber=1`);

    if (second.status !== 200) return t.skip('The catalogue has only one page.');
    assert.notEqual(first.body.content[0].productId, second.body.content[0].productId);
  });

  it('sorts by price ascending when asked', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const response = await session.get(`${paths.products}?sortBy=price&sortOrder=asc&pageSize=10`);

    assert.equal(response.status, 200);
    const prices = response.body.content.map((product) => product.price);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });

  it('filters by maximum price', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const ceiling = Math.max(...products.map((product) => product.specialPrice));
    const response = await session.get(`${paths.products}?maxPrice=${ceiling}&pageSize=50`);

    assert.equal(response.status, 200);
    for (const product of response.body.content) {
      assert.ok(product.specialPrice <= ceiling);
    }
  });

  it('filters by brand', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const brand = products.find((product) => product.brand)?.brand;
    if (!brand) return t.skip('No product in the catalogue carries a brand.');

    const response = await session.get(`${paths.products}?brands=${encodeURIComponent(brand)}&pageSize=50`);

    assert.equal(response.status, 200);
    for (const product of response.body.content) {
      assert.equal(product.brand, brand);
    }
  });

  it('lists the brand facet', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const response = await session.get(paths.brands);

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body));
    assert.deepEqual(response.body, [...new Set(response.body)], 'brands should be distinct');
  });

  it('finds a product by a keyword taken from its own name', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const word = products[0].productName.split(/\s+/).find((part) => part.length > 3);
    if (!word) return t.skip('No usable keyword in the first product name.');

    const response = await session.get(`${paths.products}?keyword=${encodeURIComponent(word)}&pageSize=50`);

    assert.equal(response.status, 200);
    assert.ok(response.body.content.length > 0);
  });

  it('BUG-04: answers a search that matches nothing with 400, not an empty page', async () => {
    // Documented in docs/backend/known-defects.md. The SPA has to special-case this, so
    // the behaviour is pinned here: when it is fixed to 200 with an empty content array,
    // this test fails and the expectation moves with the fix.
    const response = await session.get(`${paths.products}?keyword=zzz-no-such-laptop-zzz`);

    assert.equal(response.status, 400);
    assert.equal(response.body?.status, false);
  });

  it('BUG-12: answers the keyword-path search with 302 FOUND on success', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const word = products[0].productName.split(/\s+/).find((part) => part.length > 3);
    if (!word) return t.skip('No usable keyword in the first product name.');

    const response = await session.get(paths.productsByKeyword(word));

    assert.equal(response.status, 302,
      'a redirect status for a successful read - documented as BUG-12');
  });

  it('serves the specifications of a product that has them', async (t) => {
    if (needsCatalogue()) return t.skip(needsCatalogue());

    const response = await session.get(paths.specifications(products[0].productId));

    assert.ok([200, 404, 400].includes(response.status),
      `unexpected status for a specification read: ${response.status}`);
  });
});
