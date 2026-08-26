/**
 * Acceptance test - "Staff and customer boundaries".
 *
 * Level: acceptance. Each test is one scenario from features/staff-boundaries.feature.
 *
 * Two scenarios are marked KNOWN GAP in the feature file. Their tests assert what the
 * platform does today and name the defect in the message, so the suite stays green while
 * the gap stays visible. Closing either defect turns the matching test red, which is the
 * point: the fix has to come with an updated expectation.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { anonymous } from '../lib/http.js';
import { paths, registerFreshCustomer, signIn, signInAs } from '../lib/api.js';
import { stackStatus } from '../lib/preflight.js';

describe('Acceptance - staff and customer boundaries', { skip: stackStatus.skipReason }, () => {
  let customer;
  let seller;
  let administrator;

  before(async () => {
    customer = await signInAs('customer');
    seller = await signInAs('seller');
    administrator = await signInAs('admin');
  });

  it('Scenario: a customer cannot open the administration screens', async () => {
    const response = await customer.get(paths.adminProducts);

    assert.equal(response.status, 403, 'a customer must not reach the administrator catalogue');
  });

  it('Scenario: a customer cannot open the seller screens', async () => {
    const response = await customer.get(paths.sellerProducts);

    assert.equal(response.status, 403, 'a customer must not reach the seller catalogue');
  });

  it('Scenario: a seller manages their own catalogue', async () => {
    const response = await seller.get(paths.sellerProducts);

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.content));
  });

  it('Scenario: a seller cannot open the administration screens', async () => {
    const response = await seller.get(paths.adminProducts);

    assert.equal(response.status, 403);
  });

  it('Scenario: an administrator sees every order', async () => {
    const response = await administrator.get(paths.adminOrders);

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.content));
  });

  it('Scenario: an administrator sees the shop\'s figures', async () => {
    const response = await administrator.get(paths.productAnalytics);

    assert.equal(response.status, 200);
  });

  it('Scenario: a visitor who has not signed in reaches nothing private', async () => {
    const visitor = anonymous();

    for (const path of [paths.myCart, paths.myOrders, paths.adminProducts, paths.adminOrders, paths.sellerProducts]) {
      const response = await visitor.get(path);
      assert.equal(response.status, 401, `${path} answered ${response.status} to an anonymous visitor`);
    }
  });

  it('Scenario: KNOWN GAP - a shopper can grant themselves administrator rights at sign-up (SEC-01)', async () => {
    // When a shopper registers and asks for the administrator role
    const suffix = `${Date.now()}`.slice(-9);
    const account = {
      username: `esc${suffix}`,
      email: `esc${suffix}@techzone.test`,
      password: 'QaPassw0rd',
      roles: ['admin'],
    };
    const registration = await anonymous().post(paths.signUp, account);

    // Then the shop should refuse - but today it grants the role.
    assert.equal(registration.status, 200,
      'if this now fails, SEC-01 has been fixed: rewrite this scenario to expect a refusal');

    const { session } = await signIn(account);
    const identity = await session.get(paths.currentUser);
    assert.ok(identity.body?.roles?.includes('ROLE_ADMIN'),
      'if this now fails, SEC-01 has been fixed: rewrite this scenario to expect ROLE_USER');

    // The consequence, stated plainly: the self-granted account really can administer.
    const adminScreens = await session.get(paths.adminProducts);
    assert.equal(adminScreens.status, 200,
      'a self-registered administrator reaches the administration screens - this is SEC-01');
  });

  it('Scenario: KNOWN GAP - any signed-in shopper can list every cart (SEC-07)', async () => {
    // When the customer asks for every cart in the shop
    const response = await customer.get(paths.allCarts);

    // Then the shop should refuse - but today it answers.
    assert.notEqual(response.status, 403,
      'if this now fails, SEC-07 has been fixed: rewrite this scenario to expect a refusal');
    assert.ok([200, 302, 400].includes(response.status),
      `the unguarded cart listing answered ${response.status}`);
  });

  it('a fresh shopper is a plain customer unless they ask for more', async () => {
    const { account } = await registerFreshCustomer();
    const { session } = await signIn(account);

    const identity = await session.get(paths.currentUser);

    assert.deepEqual(identity.body.roles, ['ROLE_USER']);
  });
});
