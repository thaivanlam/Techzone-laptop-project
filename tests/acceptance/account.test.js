/**
 * Acceptance test - "Creating an account and signing in".
 *
 * Level: acceptance. Where the system suite asks "does the platform behave correctly?",
 * this suite asks "does the platform do what was promised to the person using it?" Each
 * test below is one scenario from features/account-and-sign-in.feature, in the same words.
 *
 * Registration creates real accounts, so every scenario invents a throw-away username.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anonymous } from '../lib/http.js';
import { paths, registerFreshCustomer, signIn } from '../lib/api.js';
import { stackStatus } from '../lib/preflight.js';

describe('Acceptance - creating an account and signing in', { skip: stackStatus.skipReason }, () => {
  it('Scenario: a new shopper registers', async () => {
    // When the shopper registers with a username, an email address and a password
    const { account, response } = await registerFreshCustomer();

    // Then the shop confirms the account was created
    assert.equal(response.status, 200, `registration was refused: ${response.text}`);
    assert.match(response.body?.message ?? '', /registered successfully/i);

    // And the shopper can sign in with those credentials
    const { session, response: signInResponse } = await signIn(account);
    assert.equal(signInResponse.status, 200);
    assert.ok(session.isAuthenticated, 'signing in should hand the shopper a session');
    assert.equal(signInResponse.body.username, account.username);
  });

  it('Scenario: a username can only be used once', async () => {
    // Given a shopper has already registered
    const { account } = await registerFreshCustomer();

    // When another shopper tries to register with the same username
    const response = await anonymous().post(paths.signUp, {
      username: account.username,
      email: `other-${account.email}`,
      password: 'QaPassw0rd',
    });

    // Then the shop refuses and explains that the username is taken
    assert.equal(response.status, 400);
    assert.match(response.body?.message ?? '', /username is already taken/i);
  });

  it('Scenario: an email address can only be used once', async () => {
    // Given a shopper has already registered
    const { account } = await registerFreshCustomer();

    // When another shopper tries to register with the same email address
    const response = await anonymous().post(paths.signUp, {
      username: `other${account.username}`.slice(0, 20),
      email: account.email,
      password: 'QaPassw0rd',
    });

    // Then the shop refuses and explains that the email address is taken
    assert.equal(response.status, 400);
    assert.match(response.body?.message ?? '', /email is already taken/i);
  });

  it('Scenario: a password that is too short is refused', async () => {
    const response = await anonymous().post(paths.signUp, {
      username: `qa${Date.now()}`.slice(0, 20),
      email: `short${Date.now()}@techzone.test`,
      password: '12345',
    });

    // Then the shop refuses before creating anything
    assert.equal(response.status, 400);
    assert.ok(response.body?.password, 'the refusal should name the password field');
  });

  it('Scenario: an address that is not an email address is refused', async () => {
    const response = await anonymous().post(paths.signUp, {
      username: `qa${Date.now()}`.slice(0, 20),
      email: 'not-an-email',
      password: 'QaPassw0rd',
    });

    assert.equal(response.status, 400);
    assert.ok(response.body?.email, 'the refusal should name the email field');
  });

  it('Scenario: signing in with the wrong password fails', async () => {
    // Given a registered shopper
    const { account } = await registerFreshCustomer();

    // When they sign in with the wrong password
    const { session, response } = await signIn({ ...account, password: 'DefinitelyWrong1' });

    // Then they are not signed in, and they receive no session
    assert.notEqual(response.status, 200);
    assert.ok(!session.isAuthenticated, 'a failed sign-in must not hand out a session');
  });

  it('Scenario: a signed-in shopper is recognised on the next request', async () => {
    // Given a registered shopper who has signed in
    const { account } = await registerFreshCustomer();
    const { session } = await signIn(account);

    // When they ask who they are
    const response = await session.get(paths.currentUser);

    // Then the shop returns their username and their role
    assert.equal(response.status, 200);
    assert.equal(response.body.username, account.username);
    assert.ok(response.body.roles.includes('ROLE_USER'),
      'a shopper who asked for no role should be a plain customer');
  });

  it('Scenario: signing out ends the session', async () => {
    // Given a registered shopper who has signed in
    const { account } = await registerFreshCustomer();
    const { session } = await signIn(account);
    assert.ok(session.isAuthenticated);

    // When they sign out
    const signOut = await session.post(paths.signOut);
    assert.equal(signOut.status, 200);

    // Then their following requests are treated as anonymous
    const afterwards = await session.get(paths.myCart);
    assert.equal(afterwards.status, 401);
  });
});
