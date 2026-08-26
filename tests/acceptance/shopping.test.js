/**
 * Acceptance test - "Browsing the shop" and "Filling a cart and buying".
 *
 * Level: acceptance. Each test is one scenario from features/browsing-the-shop.feature or
 * features/cart-and-order.feature, written in the customer's language rather than the
 * platform's.
 *
 * The buying scenarios write real rows, so they run only with RUN_DESTRUCTIVE=1.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { anonymous } from '../lib/http.js';
import { anyProductInStock, emptyTheCart, firstPageOfProducts, paths, signInAs } from '../lib/api.js';
import { RUN_DESTRUCTIVE } from '../lib/config.js';
import { stackStatus } from '../lib/preflight.js';

const visitor = anonymous();

describe('Acceptance - browsing the shop', { skip: stackStatus.skipReason }, () => {
  let laptops = [];

  before(async () => {
    laptops = (await firstPageOfProducts(visitor, { pageSize: '20' })).products;
  });

  const needsStock = () => (laptops.length === 0
    ? 'The shop has no laptops. Seed it: COMPOSE_PROFILES=prod,seed docker compose up -d.'
    : false);

  it('Scenario: a visitor sees the shop without signing in', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // When the visitor opens the shop
    const response = await visitor.get(`${paths.products}?pageSize=20`);

    // Then a list of laptops is shown
    assert.equal(response.status, 200);
    assert.ok(response.body.content.length > 0);

    // And each laptop shows a name, a price and a picture
    for (const laptop of response.body.content) {
      assert.ok(laptop.productName, 'a laptop with no name is not shoppable');
      assert.equal(typeof laptop.specialPrice, 'number');
      assert.ok(laptop.image, 'a laptop with no picture is not shoppable');
    }
  });

  it('Scenario: a visitor sees the price they will actually pay', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    for (const laptop of laptops) {
      assert.ok(laptop.specialPrice <= laptop.price,
        `${laptop.productName} is advertised above its own list price`);
    }
  });

  it('Scenario: a visitor narrows the list by brand', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // Given the visitor can see the brands the shop carries
    const brands = await visitor.get(paths.brands);
    assert.equal(brands.status, 200);
    const brand = brands.body[0];
    if (!brand) return t.skip('The shop lists no brands.');

    // When the visitor picks one brand
    const response = await visitor.get(`${paths.products}?brands=${encodeURIComponent(brand)}&pageSize=50`);

    // Then only laptops of that brand are shown
    assert.equal(response.status, 200);
    for (const laptop of response.body.content) {
      assert.equal(laptop.brand, brand);
    }
  });

  it('Scenario: a visitor narrows the list by budget', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // When the visitor sets a maximum price
    const budget = Math.min(...laptops.map((laptop) => laptop.specialPrice));
    const response = await visitor.get(`${paths.products}?maxPrice=${budget}&pageSize=50`);

    // Then no laptop above that price is shown
    assert.equal(response.status, 200);
    for (const laptop of response.body.content) {
      assert.ok(laptop.specialPrice <= budget);
    }
  });

  it('Scenario: a visitor searches for a laptop by name', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    const target = laptops[0];
    const word = target.productName.split(/\s+/).find((part) => part.length > 3);
    if (!word) return t.skip('No usable search word in the first laptop name.');

    // When the visitor types part of a laptop name into the search box
    const response = await visitor.get(`${paths.products}?keyword=${encodeURIComponent(word)}&pageSize=50`);

    // Then that laptop is among the results
    assert.equal(response.status, 200);
    assert.ok(response.body.content.some((laptop) => laptop.productId === target.productId));
  });

  it('Scenario: a search that matches nothing tells the visitor so', async () => {
    // When the visitor searches for something the shop does not sell
    const response = await visitor.get(`${paths.products}?keyword=zzz-no-such-laptop-zzz`);

    // Then the shop reports that nothing matched
    assert.equal(response.status, 400,
      'today the shop reports "no results" as a 400 - see BUG-04');
    assert.match(response.body?.message ?? '', /no products exist/i);

    // And the shop does not fail with a server error
    assert.ok(response.status < 500);
  });

  it('Scenario: a visitor moves through the catalogue a page at a time', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // When the visitor asks for a page of two laptops
    const response = await visitor.get(`${paths.products}?pageSize=2&pageNumber=0`);

    // Then at most two laptops are shown
    assert.equal(response.status, 200);
    assert.ok(response.body.content.length <= 2);

    // And the shop says whether more pages follow
    assert.equal(typeof response.body.lastPage, 'boolean');
    assert.equal(typeof response.body.totalPages, 'number');
  });
});

describe('Acceptance - filling a cart and buying', { skip: stackStatus.skipReason }, () => {
  let customer;
  let laptop;

  before(async () => {
    customer = await signInAs('customer');
    laptop = await anyProductInStock(customer);
    await emptyTheCart(customer);
  });

  after(async () => {
    if (customer) await emptyTheCart(customer);
  });

  const needsStock = () => (laptop
    ? false
    : 'The shop has no laptop in stock. Seed it: COMPOSE_PROFILES=prod,seed docker compose up -d.');

  it('Scenario: adding a laptop to the cart', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // When the customer adds a laptop to the cart
    const response = await customer.post(paths.addToCart(laptop.productId, 1));

    // Then the cart contains that laptop
    assert.equal(response.status, 201);
    const line = response.body.products.find((item) => item.productId === laptop.productId);
    assert.ok(line, 'the laptop should be a line of the cart');

    // And the cart charges the price the shop advertised
    assert.ok(Math.abs(line.specialPrice - laptop.specialPrice) < 0.01,
      `the shop advertised ${laptop.specialPrice} but the cart charges ${line.specialPrice}`);
  });

  it('Scenario: the cart total is the sum of its lines', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // When the customer looks at the cart
    const cart = await customer.get(paths.myCart);

    // Then the total equals the sum of every line
    assert.equal(cart.status, 200);
    const sum = cart.body.products.reduce((total, item) => total + item.specialPrice * item.quantity, 0);
    assert.ok(Math.abs(sum - cart.body.totalPrice) < 0.01,
      `the cart says ${cart.body.totalPrice} but its lines add up to ${sum} - see BUG-07`);
  });

  it('Scenario: changing how many units to buy', async (t) => {
    if (needsStock()) return t.skip(needsStock());
    if ((laptop.quantity ?? 0) < 2) return t.skip('The shop holds only one unit.');

    // When the customer increases the quantity
    const increased = await customer.put(paths.changeCartQuantity(laptop.productId, 'increase'));

    // Then the cart shows two units
    assert.equal(increased.status, 200);
    assert.equal(increased.body.products.find((item) => item.productId === laptop.productId).quantity, 2);

    // When the customer decreases the quantity
    const decreased = await customer.put(paths.changeCartQuantity(laptop.productId, 'delete'));

    // Then the cart shows one unit again
    assert.equal(decreased.status, 200);
    assert.equal(decreased.body.products.find((item) => item.productId === laptop.productId).quantity, 1);
  });

  it('Scenario: the shop will not sell more units than it has', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    const cartBefore = await customer.get(paths.myCart);

    // When the customer tries to buy more units than the shop holds
    const response = await customer.post(paths.addToCart(laptop.productId, (laptop.quantity ?? 0) + 100));

    // Then the shop refuses and says how many are available
    assert.equal(response.status, 400);
    assert.match(response.body?.message ?? '', new RegExp(`quantity ${laptop.quantity}`));

    // And nothing is added to the cart
    const cartAfter = await customer.get(paths.myCart);
    const before = cartBefore.body?.products?.find((item) => item.productId === laptop.productId)?.quantity ?? 0;
    const after = cartAfter.body?.products?.find((item) => item.productId === laptop.productId)?.quantity ?? 0;
    assert.equal(after, before);
  });

  it('Scenario: removing a laptop from the cart', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // Given the customer has a laptop in the cart
    const cart = await customer.get(paths.myCart);
    assert.ok(cart.body.products.some((item) => item.productId === laptop.productId));

    // When the customer removes it
    const response = await customer.delete(paths.removeFromCart(cart.body.cartId, laptop.productId));
    assert.equal(response.status, 200);

    // Then the cart no longer contains that laptop
    const afterwards = await customer.get(paths.myCart);
    assert.ok(!afterwards.body.products.some((item) => item.productId === laptop.productId));
  });

  it('Scenario: one customer never sees another customer\'s cart', async (t) => {
    if (needsStock()) return t.skip(needsStock());

    // Given two customers are signed in, each with something in their cart
    await customer.post(paths.addToCart(laptop.productId, 1));
    const otherCustomer = await signInAs('secondCustomer');
    await otherCustomer.post(paths.addToCart(laptop.productId, 1));

    const mine = await customer.get(paths.myCart);
    const theirs = await otherCustomer.get(paths.myCart);

    // Then each customer sees only their own cart
    assert.equal(mine.status, 200);
    assert.equal(theirs.status, 200);
    assert.notEqual(mine.body.cartId, theirs.body.cartId);

    await emptyTheCart(otherCustomer);
  });

  describe('buying', { skip: RUN_DESTRUCTIVE ? false : 'Set RUN_DESTRUCTIVE=1 to place a real order.' }, () => {
    let order;
    let stockBefore;

    before(async () => {
      await emptyTheCart(customer);
      laptop = (await anyProductInStock(customer)) ?? laptop;
      stockBefore = laptop?.quantity ?? 0;
      if (laptop) await customer.post(paths.addToCart(laptop.productId, 1));
    });

    it('Scenario: placing the order', async (t) => {
      if (needsStock()) return t.skip(needsStock());

      // When the customer places the order
      const response = await customer.post(paths.placeOrder('cod'), {
        addressId: null,
        pgName: 'acceptance-test',
        pgPaymentId: `acceptance-${Date.now()}`,
        pgStatus: 'succeeded',
        pgResponseMessage: 'Placed by the acceptance suite',
      });

      // Then the order is accepted
      assert.equal(response.status, 201);
      assert.equal(response.body.orderStatus, 'Accepted');
      order = response.body;

      // And the order lists the laptop that was bought
      assert.ok(order.orderItems.some((item) => item.product.productId === laptop.productId));

      // And the cart is emptied
      const cart = await customer.get(paths.myCart);
      assert.equal((cart.body?.products ?? []).length, 0);

      // And the stock in the shop goes down by what was bought
      const reread = (await firstPageOfProducts(customer, { pageSize: '50' })).products
        .find((item) => item.productId === laptop.productId);
      assert.equal(reread.quantity, stockBefore - 1);

      // And the order appears in the customer's order history
      const history = await customer.get(paths.myOrders);
      assert.equal(history.status, 200);
      assert.ok((history.body.content ?? []).some((entry) => entry.orderId === order.orderId));
    });

    it('Scenario: checking out with an empty cart', async (t) => {
      if (!order) return t.skip('The previous scenario did not place an order.');

      // Given the customer's cart is empty; when the customer tries to place an order
      const response = await customer.post(paths.placeOrder('cod'), {
        addressId: null,
        pgName: 'acceptance-test',
        pgPaymentId: `acceptance-${Date.now()}`,
        pgStatus: 'succeeded',
        pgResponseMessage: 'Empty-cart attempt',
      });

      // Then the shop refuses and says the cart is empty
      assert.equal(response.status, 400);
      assert.match(response.body?.message ?? '', /cart is empty/i);
    });
  });
});
