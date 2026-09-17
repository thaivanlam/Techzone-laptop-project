/**
 * Acceptance test - "Creating an account and signing in".
 *
 * Level: acceptance. Where the system suite asks "does the platform behave correctly?",
 * this suite asks "does the platform do what was promised to the person using it?" Each
 * test below is one scenario from features/account-and-sign-in.feature, in the same words.
 *
 * ADR-0012 changed what these scenarios can observe, and the change is the substance of the
 * migration rather than an inconvenience:
 *
 *   - Registration is a page on Keycloak, reached by redirect. There is no HTTP endpoint in
 *     this platform that creates a customer, so a scenario cannot POST one and must not:
 *     adding an endpoint back would rebuild the one SEC-01 lived in. Fixtures are therefore
 *     provisioned straight into the realm by registerFreshCustomer().
 *   - The rules those scenarios used to assert - unique username, unique email, minimum
 *     password length, well-formed address - are now realm configuration, enforced by
 *     Keycloak for registration, password reset and the account console alike. They are
 *     asserted here against the realm, where they now live.
 *   - Signing out revokes a session rather than deleting a cookie, so the scenario asserts
 *     something stronger than it could before.
 *
 * Every scenario invents a throw-away account.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anonymous } from '../lib/http.js';
import { KEYCLOAK, tokenEndpoint } from '../lib/config.js';
import { decodeClaims, paths, registerFreshCustomer, rolesOf, signIn } from '../lib/api.js';
import { stackStatus } from '../lib/preflight.js';

describe('Acceptance - creating an account and signing in', { skip: stackStatus.skipReason }, () => {
  it('Scenario: a new shopper registers', async () => {
    // When the shopper registers with an email address and a password
    const { account, response } = await registerFreshCustomer();

    // Then the account is created
    assert.equal(response.status, 201, 'registration was refused');

    // And the shopper can sign in with those credentials
    const { session, response: signInResponse } = await signIn(account);
    assert.equal(signInResponse.status, 200);
    assert.ok(session.isAuthenticated, 'signing in should hand the shopper a token');
    assert.equal(session.identity.email, account.email);
  });

  it('Scenario: SEC-01 - a new shopper is a customer and cannot ask to be anything else', async () => {
    // This is the regression test for the defect the whole migration started from. The old
    // sign-up payload carried a `roles` array and "admin" mapped straight onto ROLE_ADMIN.
    //
    // There is no request here that could carry such a field: the account is created with
    // no roles named at all, and the realm's default role decides what it gets. Assigning
    // anything more became a different API requiring a different token.
    const { account } = await registerFreshCustomer();
    const { session } = await signIn(account);

    const roles = rolesOf(session);
    assert.ok(roles.includes('ROLE_USER'), 'a new account should be a customer');
    assert.ok(!roles.includes('ROLE_SELLER'), 'a new account must not be a seller');
    assert.ok(!roles.includes('ROLE_ADMIN'), 'a new account must not be an administrator');
  });

  it('Scenario: an email address can only be used once', async () => {
    // Given a shopper has already registered
    const { account } = await registerFreshCustomer();

    // When another shopper tries to register with the same email address
    const { response } = await registerFreshCustomerWithEmail(account.email);

    // Then the realm refuses: duplicate emails are switched off, and with
    // email-as-username this covers the old "username is taken" rule as well.
    assert.equal(response.status, 409, 'a duplicate email should be refused');
  });

  it('Scenario: a password that is too short is refused', async () => {
    // The realm's password policy is length(8). It applies to registration, to an admin
    // setting a temporary password, and to the account console - one rule, one place,
    // rather than a validation annotation on one request object.
    const { response } = await registerFreshCustomerWithPassword('12345');

    assert.equal(response.status, 400, 'a short password should be refused by the realm');
  });

  it('Scenario: signing in with the wrong password fails', async () => {
    // Given a registered shopper
    const { account } = await registerFreshCustomer();

    // When they sign in with the wrong password
    const { session, response } = await signIn({ ...account, password: 'DefinitelyWrong1' });

    // Then they are not signed in, and they receive no token
    assert.equal(response.status, 401);
    assert.ok(!session.isAuthenticated, 'a failed sign-in must not hand out a token');
  });

  it('Scenario: a signed-in shopper is recognised on the next request', async () => {
    // Given a registered shopper who has signed in
    const { account } = await registerFreshCustomer();
    const { session } = await signIn(account);

    // When they ask who they are
    const response = await session.get(paths.currentUser);

    // Then the shop returns their identity and their role - and the local profile row was
    // created just in time, by this very request, since the shop had never seen them before
    assert.equal(response.status, 200);
    assert.equal(response.body.email, account.email);
    assert.ok(response.body.roles.includes('ROLE_USER'),
      'a shopper who asked for no role should be a plain customer');
  });

  it('Scenario: the shop is never handed a token it could have minted', async () => {
    // The sign-in response used to carry the token this service had just signed. Nothing in
    // the platform holds a signing key now, so there is nothing to hand back.
    const { account } = await registerFreshCustomer();
    const { session } = await signIn(account);

    const response = await session.get(paths.currentUser);
    assert.equal(response.status, 200);
    assert.equal(response.body.jwtToken, undefined, 'the profile must not carry a token');

    // And the token the shopper does hold is signed by the realm, with RS256 - not with a
    // symmetric secret that every service held a copy of (SEC-04).
    const header = JSON.parse(Buffer.from(session.accessToken.split('.')[0], 'base64url').toString());
    assert.equal(header.alg, 'RS256');
    assert.equal(decodeClaims(session.accessToken).iss, `${KEYCLOAK.url}/realms/${KEYCLOAK.realm}`);
  });

  it('Scenario: signing out ends the session everywhere, not just in this browser', async () => {
    // Given a registered shopper who has signed in
    const { account } = await registerFreshCustomer();
    const { session, response } = await signIn(account);
    assert.ok(session.isAuthenticated);
    const refreshToken = response.body.refresh_token;

    // When they sign out
    const logout = await fetch(`${KEYCLOAK.url}/realms/${KEYCLOAK.realm}/protocol/openid-connect/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: KEYCLOAK.clientId,
        client_secret: KEYCLOAK.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });
    assert.ok(logout.status < 400, `logout failed with ${logout.status}`);

    // Then the session is genuinely revoked: the refresh token no longer works.
    //
    // This is stronger than the old scenario could assert. Sign-out used to clear a cookie,
    // which removed the browser's copy of a token that stayed valid until it expired - that
    // is half of SEC-13. Revocation is now real.
    const refreshed = await fetch(tokenEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: KEYCLOAK.clientId,
        client_secret: KEYCLOAK.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });
    assert.equal(refreshed.status, 400, 'a revoked refresh token must not mint a new access token');
  });

  it('Scenario: a request with no token is anonymous', async () => {
    const afterwards = await anonymous().get(paths.myCart);
    assert.equal(afterwards.status, 401);
  });
});

// ---------------------------------------------------------------------------
// Realm fixtures for the two refusal scenarios. These talk to Keycloak directly
// because the rules under test are the realm's, not the platform's.
// ---------------------------------------------------------------------------

async function realmAdminToken() {
  const response = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'techzone-admin-api',
      client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? 'techzone-admin-api-dev-secret',
    }).toString(),
  });
  const body = await response.json();
  return body.access_token;
}

async function createInRealm({ email, password }) {
  const token = await realmAdminToken();
  const response = await fetch(`${KEYCLOAK.url}/admin/realms/${KEYCLOAK.realm}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email,
      email,
      enabled: true,
      emailVerified: true,
      credentials: [{ type: 'password', value: password, temporary: false }],
    }),
  });
  return { response: { status: response.status } };
}

const registerFreshCustomerWithEmail = (email) =>
  createInRealm({ email, password: 'QaPassw0rd' });

const registerFreshCustomerWithPassword = (password) =>
  createInRealm({ email: `qa${Date.now()}@techzone.test`, password });
