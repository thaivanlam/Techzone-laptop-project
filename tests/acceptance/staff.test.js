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

  it('Scenario: SEC-01 FIXED - a shopper cannot grant themselves administrator rights', async () => {
    // This scenario used to assert the defect. It asserted that a sign-up body carrying
    // roles: ['admin'] produced a working administrator, and said in as many words: "if
    // this now fails, SEC-01 has been fixed: rewrite this scenario to expect a refusal".
    // ADR-0012 fixed it, so here is that rewrite.
    //
    // What closed it is not tighter validation of the roles field. There is no sign-up
    // endpoint to send a roles field to: registration is Keycloak's, ROLE_USER is the
    // realm's default role, and assigning anything else became a different API needing a
    // different token.
    const { account } = await registerFreshCustomer();
    const { session } = await signIn(account);

    const identity = await session.get(paths.currentUser);
    assert.equal(identity.status, 200);
    assert.deepEqual(identity.body.roles, ['ROLE_USER'],
      'a self-registered shopper must be a plain customer');

    // And the consequence, stated as plainly as the defect was: the account cannot
    // administer anything.
    const adminScreens = await session.get(paths.adminProducts);
    assert.equal(adminScreens.status, 403,
      'a self-registered shopper must not reach the administration screens');
  });

  it('Scenario: SEC-01 - not even an administrator can create another administrator', async () => {
    // The second half of the fix, and a deliberate cost rather than a bonus. The endpoint
    // that creates sellers enforces a server-side allow-list of ROLE_SELLER and ROLE_USER,
    // so no endpoint in the platform can grant ROLE_ADMIN - which means promoting an
    // administrator now requires Keycloak console access, and the dashboard has lost an
    // operation it used to have.
    const suffix = `${Date.now()}`.slice(-9);
    const response = await administrator.post(paths.adminUsers, {
      email: `esc${suffix}@techzone.test`,
      firstName: 'Escalation',
      lastName: 'Attempt',
      role: 'ROLE_ADMIN',
    });

    assert.ok(response.status >= 400,
      `creating an administrator through the API must be refused, got ${response.status}`);
  });

  it('Scenario: an administrator creates a seller, who starts with a temporary password', async () => {
    const suffix = `${Date.now()}`.slice(-9);
    const response = await administrator.post(paths.adminUsers, {
      email: `newseller${suffix}@techzone.test`,
      firstName: 'New',
      lastName: 'Seller',
      role: 'ROLE_SELLER',
    });

    assert.equal(response.status, 200, `creating a seller was refused: ${response.text}`);
    // The password is returned once, to be handed over out of band, and Keycloak forces a
    // change at first login. Not emailed: the mail path swallows its own failures (BUG-06).
    assert.match(response.body?.message ?? '', /temporary password/i);
  });

  it('Scenario: a seller cannot create accounts', async () => {
    const response = await seller.post(paths.adminUsers, {
      email: `bogus${Date.now()}@techzone.test`,
      role: 'ROLE_SELLER',
    });

    assert.equal(response.status, 403);
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

  it('an administrator carries ROLE_SELLER through the realm composite', async () => {
    // Load-bearing, not tidiness. /product-manager/api/seller/** maps ROLE_SELLER alone, and
    // the seeded admin reached it before the migration only because the seed script happened
    // to give them that row too. The realm now states the hierarchy once - ROLE_ADMIN
    // includes ROLE_SELLER includes ROLE_USER - and Keycloak expands it into the token.
    // Without it, every seller endpoint would 403 for administrators: a regression created
    // by the migration, in code the migration never touched.
    const response = await administrator.get(paths.sellerProducts);

    assert.equal(response.status, 200,
      'an administrator must still reach the seller screens');
  });
});
