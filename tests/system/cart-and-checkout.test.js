/**
 * System test - cart and checkout across service boundaries.
 *
 * Level: whole platform. This is the suite that exercises the cross-service path the
 * architecture is built around: order-service reads the catalogue from product-service over
 * HTTP, stores a snapshot of it, and on checkout calls back to take the stock and publishes
 * a confirmation message to RabbitMQ for notification-service.
 *
 * Writing tests: everything that creates a row - placing an order - runs only when
 * RUN_DESTRUCTIVE=1 is set, so the suite is safe to point at a shared environment by
 * default. Cart changes are undone in an after hook.
 *
 * Run this file serially (--test-concurrency=1, which the npm scripts set). Two suites
 * adding the same product to the same seeded account at the same instant permanently
 * corrupts that cart - which is how BUG-21 was found, and is not something to reproduce on
 * every run.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { anyProductInStock, emptyTheCart, paths, registerFreshCustomer, signIn, signInAs } from '../lib/api.js';
import { RUN_DESTRUCTIVE } from '../lib/config.js';
import { stackStatus } from '../lib/preflight.js';

describe('System - cart and checkout', { skip: stackStatus.skipReason }, () => {
  let customer;
  let product;

  before(async () => {
    customer = await signInAs('customer');
    product = await anyProductInStock(customer);
    await emptyTheCart(customer);
  });

  after(async () => {
    if (customer) await emptyTheCart(customer);
  });

  const needsProduct = () => (product
    ? false
    : 'No product with stock on hand. Seed the catalogue: COMPOSE_PROFILES=prod,seed docker compose up -d.');

  it('adds a product to the cart at its discounted price', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());

    const response = await customer.post(paths.addToCart(product.productId, 1));

    assert.equal(response.status, 201);
    const line = response.body.products.find((item) => item.productId === product.productId);
    assert.ok(line, 'the product should appear as a cart line');
    assert.equal(line.quantity, 1);
    assert.ok(Math.abs(line.specialPrice - product.specialPrice) < 0.01,
      'the cart should charge the catalogue special price');
  });

  it('BUG-20: a customer who has never had a cart gets a 500, not an empty cart', async () => {
    // Found by this suite on its first run against a live stack. CartServiceImpl.getCart
    // calls findCartByEmail(...).getCartId() with no null check, so the very first time a
    // newly registered customer opens the cart page the platform answers 500.
    //
    // Pinned as current behaviour; once getCart returns an empty cart (or a 404), rewrite
    // this to expect that. Documented as BUG-20 in docs/backend/known-defects.md.
    const { account, response: registration } = await registerFreshCustomer();
    assert.equal(registration.status, 200, 'registration should succeed');

    const { session: fresh } = await signIn(account);
    const response = await fresh.get(paths.myCart);

    assert.equal(response.status, 500,
      'if this now passes with 200 or 404, BUG-20 is fixed - update the expectation');
  });

  it('reads the cart back with the line still on it', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());

    const response = await customer.get(paths.myCart);

    assert.equal(response.status, 200);
    assert.ok(response.body.products.some((item) => item.productId === product.productId));
  });

  it('totals the cart as the sum of its lines', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());

    const response = await customer.get(paths.myCart);
    const sumOfLines = response.body.products
      .reduce((total, item) => total + item.specialPrice * item.quantity, 0);

    assert.ok(Math.abs(sumOfLines - response.body.totalPrice) < 0.01,
      `cart total ${response.body.totalPrice} does not match the sum of its lines ${sumOfLines} (see BUG-07)`);
  });

  it('increases the quantity of a line already in the cart', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());
    if ((product.quantity ?? 0) < 2) return t.skip('Only one unit in stock.');

    const before = await customer.get(paths.myCart);
    const quantityBefore = before.body.products
      .find((item) => item.productId === product.productId).quantity;

    const response = await customer.put(paths.changeCartQuantity(product.productId, 'increase'));

    assert.equal(response.status, 200);
    const line = response.body.products.find((item) => item.productId === product.productId);
    assert.equal(line.quantity, quantityBefore + 1);
  });

  it('decreases the quantity again', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());
    if ((product.quantity ?? 0) < 2) return t.skip('Only one unit in stock.');

    const response = await customer.put(paths.changeCartQuantity(product.productId, 'delete'));

    assert.equal(response.status, 200);
    const line = response.body.products.find((item) => item.productId === product.productId);
    assert.equal(line.quantity, 1);
  });

  it('refuses to put more units in the cart than the catalogue holds', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());

    const tooMany = (product.quantity ?? 0) + 50;
    const response = await customer.post(paths.addToCart(product.productId, tooMany));

    assert.equal(response.status, 400);
    assert.equal(response.body?.status, false);
    assert.match(response.body?.message ?? '', /less than or equal to the quantity/i);
  });

  it('refuses a product that is not in the catalogue', async () => {
    const response = await customer.post(paths.addToCart(99999999, 1));

    assert.ok([400, 404, 500].includes(response.status),
      `expected a failure for an unknown product, got ${response.status}`);
    assert.notEqual(response.status, 201);
  });

  it('removes a line from the cart', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());

    const cart = await customer.get(paths.myCart);
    const response = await customer.delete(paths.removeFromCart(cart.body.cartId, product.productId));

    assert.equal(response.status, 200);
    const after = await customer.get(paths.myCart);
    assert.ok(!after.body.products.some((item) => item.productId === product.productId));
  });

  it('keeps one customer\'s cart out of another customer\'s view', async (t) => {
    if (needsProduct()) return t.skip(needsProduct());

    await customer.post(paths.addToCart(product.productId, 1));

    // The second customer has to put something in a cart before they have one at all -
    // asking for a cart that does not exist yet fails (BUG-20).
    const other = await signInAs('secondCustomer');
    await other.post(paths.addToCart(product.productId, 1));

    const mine = await customer.get(paths.myCart);
    const theirs = await other.get(paths.myCart);

    assert.equal(mine.status, 200);
    assert.equal(theirs.status, 200);
    assert.notEqual(mine.body.cartId, theirs.body.cartId);

    await emptyTheCart(other);
  });

  describe('placing an order', { skip: RUN_DESTRUCTIVE ? false : 'Set RUN_DESTRUCTIVE=1 to place a real order.' }, () => {
    let stockBefore;
    let placedOrder;

    before(async () => {
      await emptyTheCart(customer);
      const fresh = await anyProductInStock(customer);
      product = fresh ?? product;
      stockBefore = product?.quantity ?? 0;
      if (product) await customer.post(paths.addToCart(product.productId, 1));
    });

    it('accepts the order and returns it with its lines', async (t) => {
      if (needsProduct()) return t.skip(needsProduct());

      const response = await customer.post(paths.placeOrder('cod'), {
        addressId: null,
        pgName: 'system-test',
        pgPaymentId: `test-${Date.now()}`,
        pgStatus: 'succeeded',
        pgResponseMessage: 'Placed by the system test suite',
      });

      assert.equal(response.status, 201);
      assert.ok(response.body.orderId);
      assert.equal(response.body.orderStatus, 'Accepted');
      assert.ok(response.body.orderItems.length > 0);
      placedOrder = response.body;
    });

    it('empties the cart once the order is placed', async (t) => {
      if (!placedOrder) return t.skip('No order was placed.');

      const cart = await customer.get(paths.myCart);

      assert.ok((cart.body?.products ?? []).length === 0, 'the cart should be empty after checkout');
    });

    it('takes the stock out of the catalogue', async (t) => {
      if (!placedOrder) return t.skip('No order was placed.');

      const response = await customer.get(`${paths.products}?pageSize=50`);
      const reread = response.body.content.find((item) => item.productId === product.productId);

      assert.ok(reread, 'the ordered product should still be in the catalogue');
      assert.equal(reread.quantity, stockBefore - 1);
    });

    it('shows the order in the customer\'s order history', async (t) => {
      if (!placedOrder) return t.skip('No order was placed.');

      const response = await customer.get(paths.myOrders);

      assert.equal(response.status, 200);
      const ids = (response.body.content ?? []).map((order) => order.orderId);
      assert.ok(ids.includes(placedOrder.orderId));
    });

    it('shows the order to an administrator', async (t) => {
      if (!placedOrder) return t.skip('No order was placed.');

      const admin = await signInAs('admin');
      const response = await admin.get(`${paths.adminOrders}?pageSize=50&sortBy=orderId&sortOrder=desc`);

      assert.equal(response.status, 200);
      const ids = (response.body.content ?? []).map((order) => order.orderId);
      assert.ok(ids.includes(placedOrder.orderId));
    });

    it('refuses to check out an empty cart', async (t) => {
      if (!placedOrder) return t.skip('No order was placed.');

      const response = await customer.post(paths.placeOrder('cod'), {
        addressId: null,
        pgName: 'system-test',
        pgPaymentId: `test-${Date.now()}`,
        pgStatus: 'succeeded',
        pgResponseMessage: 'Second attempt on an empty cart',
      });

      assert.equal(response.status, 400);
      assert.match(response.body?.message ?? '', /cart is empty/i);
    });
  });
});
