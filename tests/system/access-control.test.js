/**
 * System test - access control at the gateway.
 *
 * Level: whole platform. This is the suite that answers "can a customer reach the admin
 * screens?" against the deployment as it actually stands, rather than against a filter in
 * isolation. The gateway unit tests prove the filter enforces a policy; this proves the
 * running system serves that policy.
 *
 * Where the platform's enforcement is known to be narrower than the path names suggest,
 * the test records the real behaviour and names the defect, so nothing here quietly
 * asserts a protection that does not exist.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { anonymous } from '../lib/http.js';
import { paths, signInAs } from '../lib/api.js';
import { stackStatus } from '../lib/preflight.js';

describe('System - access control', { skip: stackStatus.skipReason }, () => {
  describe('anonymous callers', () => {
    it('may browse the public catalogue', async () => {
      const response = await anonymous().get(`${paths.products}?pageSize=1`);

      assert.ok([200, 400].includes(response.status));
    });

    it('may list categories without signing in', async () => {
      const response = await anonymous().get(paths.categories);

      assert.ok(response.status < 500);
      assert.notEqual(response.status, 401);
    });

    it('may not read a cart', async () => {
      const response = await anonymous().get(paths.myCart);

      assert.equal(response.status, 401);
    });

    it('may not reach the admin product list', async () => {
      const response = await anonymous().get(paths.adminProducts);

      assert.equal(response.status, 401);
    });

    it('may not reach the admin order list', async () => {
      const response = await anonymous().get(paths.adminOrders);

      assert.equal(response.status, 401);
    });

    it('is refused with 401 when the auth cookie holds rubbish', async () => {
      const session = anonymous();
      session.cookies.set('springBootEcom', 'not-a-real-token');

      const response = await session.get(paths.myCart);

      assert.equal(response.status, 401);
    });
  });

  describe('a signed-in customer', () => {
    let customer;

    before(async () => {
      customer = await signInAs('customer');
    });

    it('receives an auth cookie on sign-in', () => {
      assert.ok(customer.isAuthenticated, 'sign-in should set the JWT cookie');
    });

    it('is told who they are', async () => {
      const response = await customer.get(paths.currentUser);

      assert.equal(response.status, 200);
      assert.ok(Array.isArray(response.body.roles));
      assert.ok(response.body.roles.includes('ROLE_USER'));
    });

    it('is let through to their own cart by the gateway', async () => {
      const response = await customer.get(paths.myCart);

      // What this suite is about is the gateway's decision, not what the cart
      // endpoint then answers: a customer must not be refused here. (Whether the
      // endpoint copes with a customer who has no cart yet is BUG-20, pinned in
      // cart-and-checkout.test.js.)
      assert.ok(![401, 403].includes(response.status),
        `a customer must not be refused their own cart, got ${response.status}`);
    });

    it('is refused the admin product list with 403', async () => {
      const response = await customer.get(paths.adminProducts);

      assert.equal(response.status, 403);
    });

    it('is refused the admin order list with 403', async () => {
      const response = await customer.get(paths.adminOrders);

      assert.equal(response.status, 403);
    });

    it('is refused the seller catalogue with 403', async () => {
      const response = await customer.get(paths.sellerProducts);

      assert.equal(response.status, 403);
    });

    it('is refused the seller order list with 403', async () => {
      const response = await customer.get(paths.sellerOrders);

      assert.equal(response.status, 403);
    });

    it('SEC-07: can nonetheless list every cart in the system', async () => {
      // /order-manager/api/carts carries no role mapping, so any authenticated caller
      // reaches it. Documented as SEC-07 in docs/backend/known-defects.md. Recorded, not
      // endorsed: when the endpoint is restricted this expectation must change to 403.
      const response = await customer.get(paths.allCarts);

      assert.ok([302, 400, 200].includes(response.status),
        `expected the unguarded cart listing to answer, got ${response.status}`);
      assert.notEqual(response.status, 403);
    });
  });

  describe('a signed-in seller', () => {
    let seller;

    before(async () => {
      seller = await signInAs('seller');
    });

    it('reaches the seller catalogue', async () => {
      const response = await seller.get(paths.sellerProducts);

      assert.equal(response.status, 200);
    });

    it('reaches the seller order list', async () => {
      const response = await seller.get(paths.sellerOrders);

      assert.equal(response.status, 200);
    });

    it('is refused the admin product list with 403', async () => {
      const response = await seller.get(paths.adminProducts);

      assert.equal(response.status, 403);
    });
  });

  describe('a signed-in administrator', () => {
    let admin;

    before(async () => {
      admin = await signInAs('admin');
    });

    it('reaches the admin product list', async () => {
      const response = await admin.get(paths.adminProducts);

      assert.equal(response.status, 200);
    });

    it('reaches the admin order list', async () => {
      const response = await admin.get(paths.adminOrders);

      assert.equal(response.status, 200);
    });

    it('reaches product analytics', async () => {
      const response = await admin.get(paths.productAnalytics);

      assert.equal(response.status, 200);
    });
  });

  describe('signing out', () => {
    it('clears the cookie and closes access again', async () => {
      const customer = await signInAs('customer');
      assert.ok(customer.isAuthenticated);

      const signOut = await customer.post(paths.signOut);
      assert.equal(signOut.status, 200);

      const afterSignOut = await customer.get(paths.myCart);
      assert.equal(afterSignOut.status, 401);
    });
  });
});
