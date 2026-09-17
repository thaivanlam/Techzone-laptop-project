# Acceptance criteria for creating an account and signing in.
# Executed by acceptance/account.test.js.
#
# Since ADR-0012 (2026-09-12) registration and sign-in happen on Keycloak's own pages.
# The criteria below are still the shop's promises to a shopper; where a rule is now
# enforced by the realm rather than by the platform, the scenario says so.

Feature: Creating an account and signing in
  As a shopper
  I want to register and sign in
  So that I can keep a cart and place orders

  Background:
    Given the TechZone shop is online

  Scenario: A new shopper registers
    When the shopper registers with an email address and a password
    Then the account is created
    And the shopper can sign in with those credentials

  Scenario: A new shopper is a customer and cannot ask to be anything else
    Given a shopper has registered without naming any role
    When they sign in
    Then they are a customer
    And they are neither a seller nor an administrator (SEC-01, fixed)

  Scenario: An email address can only be used once
    Given a shopper has already registered
    When another shopper tries to register with the same email address
    Then the shop refuses
    # The email is the username, so this also covers the old "username is taken" rule.

  Scenario: A password that is too short is refused
    When the shopper tries to register with a five-character password
    Then the shop refuses before creating anything

  Scenario: Signing in with the wrong password fails
    Given a registered shopper
    When they sign in with the wrong password
    Then they are not signed in
    And they receive no token

  Scenario: A signed-in shopper is recognised on the next request
    Given a registered shopper who has signed in
    When they ask who they are
    Then the shop returns their identity and their role

  Scenario: The shop is never handed a token it could have minted
    Given a registered shopper who has signed in
    When they read their profile
    Then the profile carries no token
    And the token they hold is signed by the identity provider with RS256 (SEC-04, fixed)

  Scenario: Signing out ends the session everywhere, not just in this browser
    Given a registered shopper who has signed in
    When they sign out
    Then their session can no longer be renewed (SEC-13, fixed)

  Scenario: A request with no token is anonymous
    When a visitor asks for their cart without signing in
    Then the shop refuses
